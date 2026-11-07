package restic

import (
	"encoding/json"
	"path"
	"sort"
	"strings"
)

// Limits on the size of a ChangeSummary so that a snapshot touching millions of files still
// produces a response a browser can render.
const (
	maxSummaryDirs  = 1000
	maxSummaryFiles = 300
)

// DiffChange is one entry of `restic diff --json` that can carry new data: a new ("+") or
// modified ("M") node.
type DiffChange struct {
	Path     string
	Modifier string
}

// DiffStats is the statistics message emitted at the end of `restic diff --json`.
type DiffStats struct {
	AddedFiles   int64
	AddedBytes   int64
	RemovedFiles int64
	RemovedBytes int64
}

type diffCounts struct {
	Files int64 `json:"files"`
	Bytes int64 `json:"bytes"`
}

type diffLine struct {
	MessageType string     `json:"message_type"`
	Path        string     `json:"path"`
	Modifier    string     `json:"modifier"`
	Added       diffCounts `json:"added"`
	Removed     diffCounts `json:"removed"`
}

// parseDiffLine parses one line of `restic diff --json`. Lines that are not JSON, that are of an
// unknown type, or that describe a change that cannot add data (a removal or a metadata-only
// change) return nil, nil.
func parseDiffLine(line []byte) (*DiffChange, *DiffStats) {
	var l diffLine
	if err := json.Unmarshal(line, &l); err != nil {
		return nil, nil
	}
	switch l.MessageType {
	case "change":
		if l.Modifier != "+" && l.Modifier != "M" {
			return nil, nil
		}
		return &DiffChange{Path: l.Path, Modifier: l.Modifier}, nil
	case "statistics":
		return nil, &DiffStats{
			AddedFiles:   l.Added.Files,
			AddedBytes:   l.Added.Bytes,
			RemovedFiles: l.Removed.Files,
			RemovedBytes: l.Removed.Bytes,
		}
	}
	return nil, nil
}

type lsLine struct {
	StructType string `json:"struct_type"`
	Type       string `json:"type"`
	Path       string `json:"path"`
	Size       int64  `json:"size"`
}

// parseLsFileLine returns the path and size of a regular file in a line of `restic ls --json`.
// ok is false for the snapshot header, directories, symlinks, and lines that are not JSON.
func parseLsFileLine(line []byte) (filePath string, size int64, ok bool) {
	var l lsLine
	if err := json.Unmarshal(line, &l); err != nil {
		return "", 0, false
	}
	if l.StructType == "snapshot" || l.Type != "file" || l.Path == "" {
		return "", 0, false
	}
	return l.Path, l.Size, true
}

// ChangeDir is the sum of the new and modified files below a directory.
type ChangeDir struct {
	Path  string
	Size  int64
	Files int64
}

// ChangeFile is a new or modified file.
type ChangeFile struct {
	Path     string
	Modifier string
	Size     int64
}

// ChangeSummary describes the data a snapshot added compared with another snapshot, grouped by
// folder.
type ChangeSummary struct {
	Dirs         []ChangeDir  // largest first, a parent always precedes its children
	Files        []ChangeFile // largest first
	TotalSize    int64
	TotalFiles   int64
	RemovedFiles int64
	AddedBytes   int64 // new data reported by restic diff, 0 when unknown
	Truncated    bool
}

// SummarizeChanges combines the changed paths of a diff with the file sizes of the newer
// snapshot. Changed paths that are not regular files (directories, symlinks) are ignored.
func SummarizeChanges(changes []DiffChange, sizes map[string]int64, stats *DiffStats) *ChangeSummary {
	summary := &ChangeSummary{}
	if stats != nil {
		summary.RemovedFiles = stats.RemovedFiles
		summary.AddedBytes = stats.AddedBytes
	}

	dirs := make(map[string]*ChangeDir)
	var files []ChangeFile
	for _, c := range changes {
		size, ok := sizes[c.Path]
		if !ok {
			continue
		}
		files = append(files, ChangeFile{Path: c.Path, Modifier: c.Modifier, Size: size})
		summary.TotalSize += size
		summary.TotalFiles++

		for dir := path.Dir(c.Path); ; dir = path.Dir(dir) {
			d := dirs[dir]
			if d == nil {
				d = &ChangeDir{Path: dir}
				dirs[dir] = d
			}
			d.Size += size
			d.Files++
			if dir == "/" || dir == "." {
				break
			}
		}
	}

	sort.Slice(files, func(i, j int) bool {
		if files[i].Size != files[j].Size {
			return files[i].Size > files[j].Size
		}
		return files[i].Path < files[j].Path
	})
	if len(files) > maxSummaryFiles {
		files = files[:maxSummaryFiles]
		summary.Truncated = true
	}
	summary.Files = files

	dirList := make([]ChangeDir, 0, len(dirs))
	for _, d := range dirs {
		dirList = append(dirList, *d)
	}
	// Equal sizes put the shallower directory first, which keeps every parent ahead of its children
	// and so keeps the ancestry of every directory that survives the cut below.
	sort.Slice(dirList, func(i, j int) bool {
		if dirList[i].Size != dirList[j].Size {
			return dirList[i].Size > dirList[j].Size
		}
		di, dj := strings.Count(dirList[i].Path, "/"), strings.Count(dirList[j].Path, "/")
		if di != dj {
			return di < dj
		}
		return dirList[i].Path < dirList[j].Path
	})
	if len(dirList) > maxSummaryDirs {
		dirList = dirList[:maxSummaryDirs]
		summary.Truncated = true
	}
	summary.Dirs = dirList

	return summary
}
