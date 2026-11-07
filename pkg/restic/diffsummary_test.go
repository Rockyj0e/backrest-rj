package restic

import (
	"fmt"
	"reflect"
	"testing"
)

func TestParseDiffLine(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		line       string
		wantChange *DiffChange
		wantStats  *DiffStats
	}{
		{
			name:       "added file",
			line:       `{"message_type":"change","path":"/data/new.bin","modifier":"+"}`,
			wantChange: &DiffChange{Path: "/data/new.bin", Modifier: "+"},
		},
		{
			name:       "modified file",
			line:       `{"message_type":"change","path":"/data/db.sqlite","modifier":"M"}`,
			wantChange: &DiffChange{Path: "/data/db.sqlite", Modifier: "M"},
		},
		{
			name: "removed file carries no data",
			line: `{"message_type":"change","path":"/data/old.bin","modifier":"-"}`,
		},
		{
			name: "metadata change carries no data",
			line: `{"message_type":"change","path":"/data/chmod.txt","modifier":"U"}`,
		},
		{
			name: "statistics",
			line: `{"message_type":"statistics","source_snapshot":"a","target_snapshot":"b","changed_files":3,` +
				`"added":{"files":2,"dirs":1,"others":0,"data_blobs":5,"tree_blobs":2,"bytes":4096},` +
				`"removed":{"files":1,"dirs":0,"others":0,"data_blobs":1,"tree_blobs":1,"bytes":512}}`,
			wantStats: &DiffStats{AddedFiles: 2, AddedBytes: 4096, RemovedFiles: 1, RemovedBytes: 512},
		},
		{
			name: "warning that is not json",
			line: `warning: something happened`,
		},
		{
			name: "unknown message type",
			line: `{"message_type":"verbose_status"}`,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			change, stats := parseDiffLine([]byte(tc.line))
			if !reflect.DeepEqual(change, tc.wantChange) {
				t.Errorf("change: got %+v, want %+v", change, tc.wantChange)
			}
			if !reflect.DeepEqual(stats, tc.wantStats) {
				t.Errorf("stats: got %+v, want %+v", stats, tc.wantStats)
			}
		})
	}
}

func TestParseLsFileLine(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name     string
		line     string
		wantPath string
		wantSize int64
		wantOk   bool
	}{
		{
			name:     "file",
			line:     `{"name":"a.bin","type":"file","path":"/data/a.bin","uid":0,"gid":0,"size":1234,"mode":420,"struct_type":"node"}`,
			wantPath: "/data/a.bin",
			wantSize: 1234,
			wantOk:   true,
		},
		{
			name: "directory",
			line: `{"name":"data","type":"dir","path":"/data","struct_type":"node"}`,
		},
		{
			name: "symlink",
			line: `{"name":"l","type":"symlink","path":"/data/l","struct_type":"node"}`,
		},
		{
			name: "snapshot header",
			line: `{"time":"2026-11-07T03:00:00Z","tree":"abc","paths":["/data"],"struct_type":"snapshot"}`,
		},
		{
			name: "not json",
			line: `not json`,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			gotPath, gotSize, gotOk := parseLsFileLine([]byte(tc.line))
			if gotPath != tc.wantPath || gotSize != tc.wantSize || gotOk != tc.wantOk {
				t.Errorf("got (%q, %d, %v), want (%q, %d, %v)", gotPath, gotSize, gotOk, tc.wantPath, tc.wantSize, tc.wantOk)
			}
		})
	}
}

func TestSummarizeChanges(t *testing.T) {
	t.Parallel()

	changes := []DiffChange{
		{Path: "/srv/rec/2026-11-07", Modifier: "+"}, // a directory: no size known, ignored
		{Path: "/srv/rec/2026-11-07/cam1.mp4", Modifier: "+"},
		{Path: "/srv/rec/2026-11-07/cam2.mp4", Modifier: "+"},
		{Path: "/srv/db/dump.sql", Modifier: "M"},
		{Path: "/etc/hosts", Modifier: "M"},
	}
	sizes := map[string]int64{
		"/srv/rec/2026-11-07/cam1.mp4": 700,
		"/srv/rec/2026-11-07/cam2.mp4": 200,
		"/srv/db/dump.sql":             90,
		"/etc/hosts":                   10,
	}
	stats := &DiffStats{AddedBytes: 123, RemovedFiles: 4}

	got := SummarizeChanges(changes, sizes, stats)

	if got.TotalSize != 1000 || got.TotalFiles != 4 {
		t.Errorf("totals: got size %d files %d, want 1000 and 4", got.TotalSize, got.TotalFiles)
	}
	if got.RemovedFiles != 4 || got.AddedBytes != 123 {
		t.Errorf("stats: got removed %d added %d, want 4 and 123", got.RemovedFiles, got.AddedBytes)
	}
	if got.Truncated {
		t.Errorf("did not expect a truncated summary")
	}

	wantFiles := []string{"/srv/rec/2026-11-07/cam1.mp4", "/srv/rec/2026-11-07/cam2.mp4", "/srv/db/dump.sql", "/etc/hosts"}
	var gotFiles []string
	for _, f := range got.Files {
		gotFiles = append(gotFiles, f.Path)
	}
	if !reflect.DeepEqual(gotFiles, wantFiles) {
		t.Errorf("files: got %v, want %v", gotFiles, wantFiles)
	}

	wantDirs := []ChangeDir{
		{Path: "/", Size: 1000, Files: 4},
		{Path: "/srv", Size: 990, Files: 3},
		{Path: "/srv/rec", Size: 900, Files: 2},
		{Path: "/srv/rec/2026-11-07", Size: 900, Files: 2},
		{Path: "/srv/db", Size: 90, Files: 1},
		{Path: "/etc", Size: 10, Files: 1},
	}
	if !reflect.DeepEqual(got.Dirs, wantDirs) {
		t.Errorf("dirs:\n got  %+v\n want %+v", got.Dirs, wantDirs)
	}
}

func TestSummarizeChangesTruncates(t *testing.T) {
	t.Parallel()

	var changes []DiffChange
	sizes := make(map[string]int64)
	for i := 0; i < maxSummaryFiles+50; i++ {
		p := fmt.Sprintf("/d%d/f", i)
		changes = append(changes, DiffChange{Path: p, Modifier: "+"})
		sizes[p] = int64(i + 1)
	}

	got := SummarizeChanges(changes, sizes, nil)

	if !got.Truncated {
		t.Errorf("expected a truncated summary")
	}
	if len(got.Files) != maxSummaryFiles {
		t.Errorf("got %d files, want %d", len(got.Files), maxSummaryFiles)
	}
	if got.TotalFiles != int64(maxSummaryFiles+50) {
		t.Errorf("totals must count every file, got %d", got.TotalFiles)
	}
	if got.Files[0].Size != int64(maxSummaryFiles+50) {
		t.Errorf("largest file must come first, got size %d", got.Files[0].Size)
	}
	if got.Dirs[0].Path != "/" {
		t.Errorf("root directory must come first, got %q", got.Dirs[0].Path)
	}
}

func TestSummarizeChangesWithoutChanges(t *testing.T) {
	t.Parallel()

	got := SummarizeChanges(nil, nil, nil)
	if got.TotalFiles != 0 || got.TotalSize != 0 || len(got.Dirs) != 0 || len(got.Files) != 0 {
		t.Errorf("expected an empty summary, got %+v", got)
	}
}
