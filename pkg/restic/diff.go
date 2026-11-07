package restic

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os/exec"
)

// errStopStream is returned by a line handler to end a stream early without it being an error.
var errStopStream = errors.New("stop streaming restic output")

// streamLines runs a restic command and calls handle for every line it prints to stdout. Unlike
// the other commands, the output is neither buffered nor copied to the operation log because
// commands such as `ls` of a whole snapshot print one line per file.
func (r *Repo) streamLines(ctx context.Context, args []string, handle func(line []byte) error, opts ...GenericOption) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	cmd := r.commandWithContext(ctx, args, opts...)
	errorCollector := errorMessageCollector{}
	pr, pw := io.Pipe()

	handlers := []func(cmd *exec.Cmd, opts *outputOpts){withStdOutTo(pw), withStdErrTo(&errorCollector)}
	if logger := LoggerFromContext(ctx); logger != nil {
		fmt.Fprintf(logger, "command: %q\n", cmd)
		handlers = append(handlers, withStdErrTo(logger))
	}
	r.handleOutput(cmd, handlers...)

	runErr := make(chan error, 1)
	go func() {
		err := cmd.Run()
		pw.Close()
		runErr <- err
	}()

	scanner := bufio.NewScanner(pr)
	scanner.Buffer(make([]byte, 0, 64*1024), 16*1024*1024)
	var handleErr error
	for scanner.Scan() {
		if handleErr = handle(scanner.Bytes()); handleErr != nil {
			break
		}
	}

	if scanErr := scanner.Err(); handleErr != nil || scanErr != nil {
		// Stop the command and release it if it is blocked writing to the pipe.
		cancel()
		pr.Close()
		<-runErr
		if errors.Is(handleErr, errStopStream) {
			return nil
		}
		if handleErr != nil {
			return handleErr
		}
		return fmt.Errorf("reading restic output: %w", scanErr)
	}

	if err := <-runErr; err != nil {
		return errorCollector.AddCmdOutputToError(cmd, err)
	}
	return nil
}

// Diff compares two snapshots and returns the nodes that are new or modified in `to`, together
// with the statistics restic reports for the comparison.
func (r *Repo) Diff(ctx context.Context, from string, to string, opts ...GenericOption) ([]DiffChange, *DiffStats, error) {
	var changes []DiffChange
	var stats *DiffStats
	err := r.streamLines(ctx, []string{"diff", "--json", from, to}, func(line []byte) error {
		change, st := parseDiffLine(line)
		if change != nil {
			changes = append(changes, *change)
		}
		if st != nil {
			stats = st
		}
		return nil
	}, opts...)
	if err != nil {
		return nil, nil, fmt.Errorf("restic diff: %w", err)
	}
	return changes, stats, nil
}

// FileSizes returns the size of every regular file of the snapshot that is listed in want. The
// listing stops as soon as all of them have been found.
func (r *Repo) FileSizes(ctx context.Context, snapshot string, want map[string]struct{}, opts ...GenericOption) (map[string]int64, error) {
	sizes := make(map[string]int64, len(want))
	if len(want) == 0 {
		return sizes, nil
	}
	err := r.streamLines(ctx, []string{"ls", "--json", snapshot}, func(line []byte) error {
		filePath, size, ok := parseLsFileLine(line)
		if !ok {
			return nil
		}
		if _, wanted := want[filePath]; wanted {
			sizes[filePath] = size
			if len(sizes) == len(want) {
				return errStopStream
			}
		}
		return nil
	}, opts...)
	if err != nil {
		return nil, fmt.Errorf("restic ls: %w", err)
	}
	return sizes, nil
}
