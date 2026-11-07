import {
  GetSnapshotChangesResponse,
  SnapshotChangeDir,
  SnapshotChangeFile,
} from "../../../gen/ts/v1/service_pb";

/** Parent of a snapshot path ("/a/b" -> "/a", "/a" -> "/"), undefined for the root. */
export const parentPath = (path: string): string | undefined => {
  if (path === "/" || path === "." || path === "") return undefined;
  const i = path.lastIndexOf("/");
  if (i < 0) return ".";
  return i === 0 ? "/" : path.slice(0, i);
};

/** Directory that contains a file path. */
export const dirOf = (path: string): string => parentPath(path) ?? "/";

export const baseName = (path: string): string => {
  if (path === "/" || path === ".") return path;
  return path.slice(path.lastIndexOf("/") + 1);
};

/**
 * The folder to open first. Walks down from the root for as long as one subfolder holds all of the
 * data of the current one, because "/" -> "/srv" -> "/srv/data" is not worth three clicks.
 */
export const startingPath = (resp: GetSnapshotChangesResponse): string => {
  const roots = resp.dirs.filter((d) => parentPath(d.path) === undefined);
  let current = roots[0]?.path;
  if (current === undefined) return "/";
  for (;;) {
    const here = resp.dirs.find((d) => d.path === current)!;
    const children = childDirs(resp, current);
    const directFiles = resp.files.some((f) => dirOf(f.path) === current);
    if (
      children.length === 1 &&
      children[0].size === here.size &&
      !directFiles
    ) {
      current = children[0].path;
    } else {
      return current;
    }
  }
};

/** Subfolders of a folder, largest first. */
export const childDirs = (
  resp: GetSnapshotChangesResponse,
  path: string,
): SnapshotChangeDir[] =>
  resp.dirs
    .filter((d) => d.path !== path && parentPath(d.path) === path)
    .sort((a, b) => Number(b.size - a.size) || a.path.localeCompare(b.path));

/** Largest files that sit directly in a folder, largest first. */
export const filesIn = (
  resp: GetSnapshotChangesResponse,
  path: string,
): SnapshotChangeFile[] =>
  resp.files
    .filter((f) => dirOf(f.path) === path)
    .sort((a, b) => Number(b.size - a.size) || a.path.localeCompare(b.path));

/**
 * Bytes of the folder that none of the listed subfolders or files account for: small files, or
 * entries that were cut from the response because only the largest are returned.
 */
export const unlistedSize = (
  resp: GetSnapshotChangesResponse,
  path: string,
): number => {
  const here = resp.dirs.find((d) => d.path === path);
  if (!here) return 0;
  let rest = here.size;
  for (const d of childDirs(resp, path)) rest -= d.size;
  for (const f of filesIn(resp, path)) rest -= f.size;
  return Math.max(0, Number(rest));
};

/** Folders from the root down to a path, for a breadcrumb. */
export const breadcrumbs = (path: string): string[] => {
  const out: string[] = [];
  for (let p: string | undefined = path; p !== undefined; p = parentPath(p)) {
    out.unshift(p);
  }
  return out;
};
