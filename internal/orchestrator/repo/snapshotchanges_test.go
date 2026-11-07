package repo

import (
	"context"
	"strings"
	"testing"

	"github.com/garethgeorge/backrest/pkg/restic"
)

func TestChangeSummaryToProto(t *testing.T) {
	t.Parallel()

	got := changeSummaryToProto(&restic.ChangeSummary{
		Dirs:         []restic.ChangeDir{{Path: "/", Size: 30, Files: 2}, {Path: "/a", Size: 20, Files: 1}},
		Files:        []restic.ChangeFile{{Path: "/a/f", Modifier: "M", Size: 20}},
		TotalSize:    30,
		TotalFiles:   2,
		RemovedFiles: 5,
		AddedBytes:   11,
		Truncated:    true,
	})

	if len(got.Dirs) != 2 || got.Dirs[1].Path != "/a" || got.Dirs[1].Size != 20 || got.Dirs[1].Files != 1 {
		t.Errorf("unexpected dirs: %v", got.Dirs)
	}
	if len(got.Files) != 1 || got.Files[0].Modifier != "M" || got.Files[0].Size != 20 {
		t.Errorf("unexpected files: %v", got.Files)
	}
	if got.TotalSize != 30 || got.TotalFiles != 2 || got.RemovedFiles != 5 || got.AddedBytes != 11 || !got.Truncated {
		t.Errorf("unexpected totals: %v", got)
	}
}

func TestGetSnapshotChangesRejectsInvalidIds(t *testing.T) {
	t.Parallel()

	valid := strings.Repeat("a", 64)
	r := &RepoOrchestrator{}
	for _, tc := range []struct{ snapshot, parent string }{
		{"--help", valid},
		{valid, "latest"},
		{valid, ""},
		{strings.Repeat("A", 64), valid},
		{valid[:63], valid},
	} {
		if _, err := r.GetSnapshotChanges(context.Background(), tc.snapshot, tc.parent); err == nil {
			t.Errorf("expected an error for snapshot %q parent %q", tc.snapshot, tc.parent)
		}
	}
}
