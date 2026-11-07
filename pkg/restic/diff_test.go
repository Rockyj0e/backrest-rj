package restic

import (
	"context"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func fakeRestic(t *testing.T, script string) *Repo {
	t.Helper()
	if runtime.GOOS == "windows" {
		t.Skip("uses a shell script as a stand-in for the restic binary")
	}
	p := filepath.Join(t.TempDir(), "restic")
	if err := os.WriteFile(p, []byte("#!/bin/sh\n"+script), 0o755); err != nil {
		t.Fatal(err)
	}
	return &Repo{cmd: p}
}

func TestDiffStream(t *testing.T) {
	r := fakeRestic(t, `
echo '{"message_type":"change","path":"/a/new","modifier":"+"}'
echo 'warning: noise'
echo '{"message_type":"change","path":"/a/gone","modifier":"-"}'
echo '{"message_type":"change","path":"/b/mod","modifier":"M"}'
echo '{"message_type":"statistics","added":{"files":2,"bytes":99},"removed":{"files":1,"bytes":5}}'
`)
	changes, stats, err := r.Diff(context.Background(), "x", "y")
	if err != nil {
		t.Fatal(err)
	}
	if len(changes) != 2 || changes[0].Path != "/a/new" || changes[1].Path != "/b/mod" {
		t.Fatalf("changes: %+v", changes)
	}
	if stats == nil || stats.AddedBytes != 99 || stats.RemovedFiles != 1 {
		t.Fatalf("stats: %+v", stats)
	}
}

func TestDiffFailureReportsStderr(t *testing.T) {
	r := fakeRestic(t, `echo 'Fatal: unable to open repository' >&2; exit 1`)
	_, _, err := r.Diff(context.Background(), "x", "y")
	if err == nil || !strings.Contains(err.Error(), "unable to open repository") {
		t.Fatalf("expected stderr in error, got %v", err)
	}
}

func TestFileSizesLargeOutputAndEarlyStop(t *testing.T) {
	// 100k lines then the wanted file is near the start so the listing should stop early
	r := fakeRestic(t, `
echo '{"struct_type":"snapshot","time":"t"}'
echo '{"type":"dir","path":"/d","struct_type":"node"}'
echo '{"type":"file","path":"/d/want","size":42,"struct_type":"node"}'
i=0
while [ $i -lt 100000 ]; do
  echo '{"type":"file","path":"/d/filler'$i'","size":1,"struct_type":"node"}' || exit 0
  i=$((i+1))
done
`)
	sizes, err := r.FileSizes(context.Background(), "snap", map[string]struct{}{"/d/want": {}})
	if err != nil {
		t.Fatal(err)
	}
	if sizes["/d/want"] != 42 || len(sizes) != 1 {
		t.Fatalf("sizes: %v", sizes)
	}
}

func TestFileSizesFullScan(t *testing.T) {
	r := fakeRestic(t, `
echo '{"struct_type":"snapshot"}'
i=0
while [ $i -lt 50000 ]; do
  echo '{"type":"file","path":"/f'$i'","size":'$i',"struct_type":"node"}'
  i=$((i+1))
done
`)
	want := map[string]struct{}{"/f10": {}, "/f49999": {}, "/missing": {}}
	sizes, err := r.FileSizes(context.Background(), "snap", want)
	if err != nil {
		t.Fatal(err)
	}
	if sizes["/f10"] != 10 || sizes["/f49999"] != 49999 || len(sizes) != 2 {
		t.Fatalf("sizes: %v", sizes)
	}
}

func TestFileSizesNothingWanted(t *testing.T) {
	r := &Repo{cmd: "/nonexistent"}
	sizes, err := r.FileSizes(context.Background(), "snap", nil)
	if err != nil || len(sizes) != 0 {
		t.Fatalf("got %v %v", sizes, err)
	}
}

func TestCancelledContext(t *testing.T) {
	r := fakeRestic(t, `sleep 30`)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, _, err := r.Diff(ctx, "x", "y"); err == nil {
		t.Fatal("expected error on cancelled context")
	}
}
