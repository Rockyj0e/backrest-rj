package tasks

import (
	"context"
	"fmt"
	"time"

	v1 "github.com/garethgeorge/backrest/gen/go/v1"
	"github.com/garethgeorge/backrest/internal/oplog"
	"github.com/garethgeorge/backrest/internal/orchestrator/repo"
	"github.com/garethgeorge/backrest/internal/protoutil"
	"go.uber.org/zap"
)

func NewOneoffIndexSnapshotsTask(repo *v1.Repo, at time.Time) Task {
	return &GenericOneoffTask{
		BaseTask: BaseTask{
			TaskType: "index_snapshots",
			TaskName: fmt.Sprintf("index snapshots for repo %q", repo.Id),
			TaskRepo: repo,
		},
		RunAt:   at,
		ProtoOp: nil,
		Do: func(ctx context.Context, st ScheduledTask, taskRunner TaskRunner) error {
			return NotifyError(ctx, taskRunner, st.Task.Name(), indexSnapshotsHelper(ctx, st, taskRunner))
		},
	}
}

// indexSnapshotsHelper indexes all snapshots for a plan.
//   - If the snapshot is already indexed, it is skipped.
//   - If the snapshot is not indexed, an index snapshot operation with it's metadata is added.
//   - If an index snapshot operation is found for a snapshot that is not returned by the repo, it is marked as forgotten.
func indexSnapshotsHelper(ctx context.Context, st ScheduledTask, taskRunner TaskRunner) error {
	t := st.Task
	l := taskRunner.Logger(ctx)

	repo, err := taskRunner.GetRepoOrchestrator(t.RepoID())
	if err != nil {
		return fmt.Errorf("couldn't get repo %q: %w", t.RepoID(), err)
	}

	// collect all tracked snapshots for the plan.
	snapshots, err := repo.Snapshots(ctx)
	if err != nil {
		return fmt.Errorf("get snapshots for repo %q: %w", t.RepoID(), err)
	}

	// collect all current snapshot IDs.
	currentIds, missingPacked, err := indexCurrentSnapshotIdsForRepo(taskRunner, t.Repo().GetGuid())
	if err != nil {
		return fmt.Errorf("get known snapshot IDs for repo %q: %w", t.RepoID(), err)
	}

	foundIds := make(map[string]struct{})

	// Index newly found operations
	var indexOps []*v1.Operation
	// Already-indexed snapshots whose stored summary lacks data_added_packed (indexed before the
	// field was tracked) but which restic now reports it for: opId -> packed size.
	packedBackfill := make(map[int64]int64)
	for _, snapshot := range snapshots {
		if opId, ok := currentIds[snapshot.Id]; ok {
			foundIds[snapshot.Id] = struct{}{}
			if _, needs := missingPacked[snapshot.Id]; needs && snapshot.SnapshotSummary.DataAddedPacked > 0 {
				packedBackfill[opId] = snapshot.SnapshotSummary.DataAddedPacked
			}
			continue
		}

		snapshotProto := protoutil.SnapshotToProto(snapshot)
		flowID, err := FlowIDForSnapshotID(taskRunner, t.Repo().GetGuid(), snapshot.Id)
		if err != nil {
			return fmt.Errorf("get flow ID for snapshot %q: %w", snapshot.Id, err)
		}
		planId := planForSnapshot(snapshotProto)
		instanceID := instanceIDForSnapshot(snapshotProto)
		indexOps = append(indexOps, &v1.Operation{
			RepoId:          t.Repo().Id,
			RepoGuid:        t.Repo().Guid,
			PlanId:          planId,
			FlowId:          flowID,
			InstanceId:      instanceID,
			UnixTimeStartMs: snapshotProto.UnixTimeMs,
			UnixTimeEndMs:   snapshotProto.UnixTimeMs + snapshot.SnapshotSummary.DurationMs(),
			Status:          v1.OperationStatus_STATUS_SUCCESS,
			SnapshotId:      snapshotProto.Id,
			Op: &v1.Operation_OperationIndexSnapshot{
				OperationIndexSnapshot: &v1.OperationIndexSnapshot{
					Snapshot: snapshotProto,
				},
			},
		})
	}

	l.Sugar().Debugf("adding %v new snapshots to the oplog", len(indexOps))
	l.Sugar().Debugf("found %v snapshots already indexed", len(foundIds))

	if err := taskRunner.CreateOperation(indexOps...); err != nil {
		return fmt.Errorf("Create snapshot operations: %w", err)
	}

	// Backfill data_added_packed on operations indexed before the field was tracked.
	var backfillOps []*v1.Operation
	for opId, packed := range packedBackfill {
		op, err := taskRunner.GetOperation(opId)
		if err != nil {
			return fmt.Errorf("get operation %v: %w", opId, err)
		}
		snapshotOp, ok := op.Op.(*v1.Operation_OperationIndexSnapshot)
		if !ok || snapshotOp.OperationIndexSnapshot.GetSnapshot().GetSummary() == nil {
			continue
		}
		snapshotOp.OperationIndexSnapshot.Snapshot.Summary.DataAddedPacked = packed
		backfillOps = append(backfillOps, op)
	}
	if len(backfillOps) > 0 {
		if err := taskRunner.UpdateOperation(backfillOps...); err != nil {
			return fmt.Errorf("backfill packed size on %v index snapshot operations: %w", len(backfillOps), err)
		}
		l.Sugar().Infof("backfilled data_added_packed on %v already-indexed snapshots", len(backfillOps))
	}

	// Mark missing operations as newly forgotten.
	for id, opId := range currentIds {
		if _, ok := foundIds[id]; ok {
			// skip snapshots that were found.
			continue
		}

		// mark snapshot forgotten.
		op, err := taskRunner.GetOperation(opId)
		if err != nil {
			// should only be possible in the case of a data race (e.g. operation was somehow deleted).
			return fmt.Errorf("get operation %v: %w", opId, err)
		}

		snapshotOp, ok := op.Op.(*v1.Operation_OperationIndexSnapshot)
		if !ok {
			return fmt.Errorf("operation %v is not an index snapshot operation", opId)
		}
		snapshotOp.OperationIndexSnapshot.Forgot = true

		if err := taskRunner.UpdateOperation(op); err != nil {
			return fmt.Errorf("mark index snapshot operation %v as forgotten: %w", opId, err)
		}
	}

	l.Sugar().Debugf("marked %v snapshots as forgotten", len(currentIds)-len(foundIds))

	return err
}

// returns a map of current (e.g. not forgotten) snapshot IDs for the plan, and the set of those
// whose stored summary reports data added but no packed size (indexed before that field existed).
func indexCurrentSnapshotIdsForRepo(taskRunner TaskRunner, repoGUID string) (map[string]int64, map[string]struct{}, error) {
	knownIds := make(map[string]int64)
	missingPacked := make(map[string]struct{})

	startTime := time.Now()
	if err := taskRunner.QueryOperations(oplog.Query{}.
		SetRepoGUID(repoGUID),
		func(op *v1.Operation) error {
			if snapshotOp, ok := op.Op.(*v1.Operation_OperationIndexSnapshot); ok {
				if !snapshotOp.OperationIndexSnapshot.Forgot {
					snapshot := snapshotOp.OperationIndexSnapshot.Snapshot
					knownIds[snapshot.Id] = op.Id
					if s := snapshot.GetSummary(); s != nil && s.DataAdded > 0 && s.DataAddedPacked == 0 {
						missingPacked[snapshot.Id] = struct{}{}
					}
				}
			}
			return nil
		}); err != nil {
		return nil, nil, err
	}
	zap.S().Debugf("found %v known snapshot IDs for repo %v in %v", len(knownIds), repoGUID, time.Since(startTime))
	return knownIds, missingPacked, nil
}

func planForSnapshot(snapshot *v1.ResticSnapshot) string {
	p := repo.PlanFromTags(snapshot.Tags)
	if p != "" {
		return p
	}
	return PlanForUnassociatedOperations
}

func instanceIDForSnapshot(snapshot *v1.ResticSnapshot) string {
	id := repo.InstanceIDFromTags(snapshot.Tags)
	if id != "" {
		return id
	}
	return InstanceIDForUnassociatedOperations
}
