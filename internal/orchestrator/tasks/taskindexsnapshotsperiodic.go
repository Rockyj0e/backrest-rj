package tasks

import (
	"context"
	"fmt"
	"time"

	v1 "github.com/garethgeorge/backrest/gen/go/v1"
)

const (
	// periodicIndexStartupDelay is how long after (re)scheduling the first periodic index runs.
	periodicIndexStartupDelay = 10 * time.Second
	// periodicIndexInterval is how often snapshots are re-indexed so that snapshots created
	// outside of Backrest (e.g. restic run from cron) show up without a manual "Index Snapshots".
	periodicIndexInterval = 10 * time.Minute
)

// PeriodicIndexSnapshotsTask re-indexes the snapshots of a repo at a fixed interval.
// It reuses indexSnapshotsHelper, the same code path as the manual and post-backup index.
type PeriodicIndexSnapshotsTask struct {
	BaseTask
	firstRun bool
}

var _ Task = &PeriodicIndexSnapshotsTask{}

func NewPeriodicIndexSnapshotsTask(repo *v1.Repo) Task {
	return &PeriodicIndexSnapshotsTask{
		BaseTask: BaseTask{
			TaskType: "index_snapshots_periodic",
			TaskName: fmt.Sprintf("periodic index snapshots for repo %q", repo.Id),
			TaskRepo: repo,
		},
	}
}

func (t *PeriodicIndexSnapshotsTask) Next(now time.Time, runner TaskRunner) (ScheduledTask, error) {
	if !t.firstRun {
		t.firstRun = true
		return ScheduledTask{RunAt: now.Add(periodicIndexStartupDelay)}, nil
	}
	return ScheduledTask{RunAt: now.Add(periodicIndexInterval)}, nil
}

func (t *PeriodicIndexSnapshotsTask) Run(ctx context.Context, st ScheduledTask, runner TaskRunner) error {
	// Errors are returned (and logged by the orchestrator) but deliberately not sent through
	// NotifyError: this runs every few minutes and must not spam hooks while a repo is offline.
	return indexSnapshotsHelper(ctx, st, runner)
}
