package repo

import (
	"context"
	"fmt"
	"regexp"

	v1 "github.com/garethgeorge/backrest/gen/go/v1"
	"github.com/garethgeorge/backrest/pkg/restic"
)

var snapshotIdPattern = regexp.MustCompile(`^[0-9a-f]{64}$`)

// GetSnapshotChanges compares a snapshot with the snapshot it was made against and reports the
// new and modified files, with their sizes, grouped by folder. The sizes are those of the files
// as they are in the source, not what they cost in the repository: a modified file only adds the
// parts that changed, and a file whose content is already in the repository adds nothing.
func (r *RepoOrchestrator) GetSnapshotChanges(ctx context.Context, snapshotId string, parentId string) (*v1.GetSnapshotChangesResponse, error) {
	// the ids are passed to restic as arguments, only accept what a snapshot id looks like
	for _, id := range []string{snapshotId, parentId} {
		if !snapshotIdPattern.MatchString(id) {
			return nil, fmt.Errorf("invalid snapshot id %q", id)
		}
	}

	ctx, flush := forwardResticLogs(ctx)
	defer flush()

	changes, stats, err := r.repo.Diff(ctx, parentId, snapshotId, restic.WithFlags("--no-lock"))
	if err != nil {
		return nil, fmt.Errorf("failed to compare snapshots: %w", err)
	}

	want := make(map[string]struct{}, len(changes))
	for _, c := range changes {
		want[c.Path] = struct{}{}
	}
	sizes, err := r.repo.FileSizes(ctx, snapshotId, want, restic.WithFlags("--no-lock"))
	if err != nil {
		return nil, fmt.Errorf("failed to read file sizes: %w", err)
	}

	return changeSummaryToProto(restic.SummarizeChanges(changes, sizes, stats)), nil
}

func changeSummaryToProto(s *restic.ChangeSummary) *v1.GetSnapshotChangesResponse {
	resp := &v1.GetSnapshotChangesResponse{
		TotalSize:    s.TotalSize,
		TotalFiles:   s.TotalFiles,
		RemovedFiles: s.RemovedFiles,
		AddedBytes:   s.AddedBytes,
		Truncated:    s.Truncated,
	}
	for _, d := range s.Dirs {
		resp.Dirs = append(resp.Dirs, &v1.SnapshotChangeDir{Path: d.Path, Size: d.Size, Files: d.Files})
	}
	for _, f := range s.Files {
		resp.Files = append(resp.Files, &v1.SnapshotChangeFile{Path: f.Path, Modifier: f.Modifier, Size: f.Size})
	}
	return resp
}
