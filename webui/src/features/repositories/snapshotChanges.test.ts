import { describe, expect, it } from "vitest";
import { create } from "@bufbuild/protobuf";
import { GetSnapshotChangesResponseSchema } from "../../../gen/ts/v1/service_pb";
import {
  baseName,
  breadcrumbs,
  childDirs,
  dirOf,
  filesIn,
  parentPath,
  startingPath,
  unlistedSize,
} from "./snapshotChanges";

const resp = (dirs: [string, number][], files: [string, number][] = []) =>
  create(GetSnapshotChangesResponseSchema, {
    dirs: dirs.map(([path, size]) => ({
      path,
      size: BigInt(size),
      files: 1n,
    })),
    files: files.map(([path, size]) => ({
      path,
      modifier: "+",
      size: BigInt(size),
    })),
  });

describe("paths", () => {
  it("finds parents, directories and names", () => {
    expect(parentPath("/a/b")).toBe("/a");
    expect(parentPath("/a")).toBe("/");
    expect(parentPath("/")).toBeUndefined();
    expect(parentPath("a")).toBe(".");
    expect(parentPath(".")).toBeUndefined();
    expect(dirOf("/a/b/c.txt")).toBe("/a/b");
    expect(dirOf("/c.txt")).toBe("/");
    expect(baseName("/a/b/c.txt")).toBe("c.txt");
    expect(baseName("/")).toBe("/");
  });

  it("builds breadcrumbs from the root", () => {
    expect(breadcrumbs("/srv/rec")).toEqual(["/", "/srv", "/srv/rec"]);
    expect(breadcrumbs("/")).toEqual(["/"]);
  });
});

describe("folder navigation", () => {
  const r = resp(
    [
      ["/", 1000],
      ["/srv", 990],
      ["/srv/rec", 900],
      ["/srv/db", 90],
      ["/etc", 10],
    ],
    [
      ["/srv/db/dump.sql", 60],
      ["/etc/hosts", 10],
    ],
  );

  it("lists subfolders largest first", () => {
    expect(childDirs(r, "/").map((d) => d.path)).toEqual(["/srv", "/etc"]);
    expect(childDirs(r, "/srv").map((d) => d.path)).toEqual([
      "/srv/rec",
      "/srv/db",
    ]);
    expect(childDirs(r, "/srv/rec")).toEqual([]);
  });

  it("lists the files directly in a folder", () => {
    expect(filesIn(r, "/srv/db").map((f) => f.path)).toEqual([
      "/srv/db/dump.sql",
    ]);
    expect(filesIn(r, "/srv")).toEqual([]);
  });

  it("accounts for what is not listed", () => {
    // /srv/db holds 90 but only a 60 byte file is listed
    expect(unlistedSize(r, "/srv/db")).toBe(30);
    // /etc is fully explained by its file
    expect(unlistedSize(r, "/etc")).toBe(0);
    // /srv: 990 - 900 - 90 = 0
    expect(unlistedSize(r, "/srv")).toBe(0);
    expect(unlistedSize(r, "/missing")).toBe(0);
  });

  it("starts at the first folder that branches", () => {
    expect(startingPath(r)).toBe("/");
    const chain = resp(
      [
        ["/", 500],
        ["/srv", 500],
        ["/srv/data", 500],
        ["/srv/data/a", 300],
        ["/srv/data/b", 200],
      ],
      [["/srv/data/a/x", 300]],
    );
    expect(startingPath(chain)).toBe("/srv/data");
  });

  it("does not skip a folder that has files of its own", () => {
    const r2 = resp(
      [
        ["/", 500],
        ["/srv", 500],
      ],
      [["/f", 10]],
    );
    expect(startingPath(r2)).toBe("/");
  });

  it("copes with an empty response", () => {
    expect(startingPath(resp([]))).toBe("/");
  });
});
