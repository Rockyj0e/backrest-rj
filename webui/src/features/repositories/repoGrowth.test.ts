import { describe, expect, it } from "vitest";
import { create } from "@bufbuild/protobuf";
import { OperationSchema } from "../../../gen/ts/v1/operations_pb";
import { buildGrowthRows, rowCost, summarizeGrowth } from "./repoGrowth";

const indexOp = (
  id: string,
  timeMs: number,
  summary?: {
    dataAdded: bigint;
    dataAddedPacked: bigint;
    totalBytesProcessed: bigint;
  },
) =>
  create(OperationSchema, {
    planId: "plan",
    op: {
      case: "operationIndexSnapshot",
      value: {
        snapshot: {
          id,
          unixTimeMs: BigInt(timeMs),
          hostname: "host",
          summary,
        },
      },
    },
  });

describe("buildGrowthRows", () => {
  it("keeps only index-snapshot ops with a summary, newest first, limited", () => {
    const ops = [
      indexOp("a", 1000, {
        dataAdded: 10n,
        dataAddedPacked: 4n,
        totalBytesProcessed: 100n,
      }),
      indexOp("b", 3000, {
        dataAdded: 20n,
        dataAddedPacked: 0n,
        totalBytesProcessed: 200n,
      }),
      indexOp("c", 2000),
      create(OperationSchema, { op: { case: "operationCheck", value: {} } }),
    ];
    const rows = buildGrowthRows(ops, 10);
    expect(rows.map((r) => r.key)).toEqual(["b", "a"]);
    expect(buildGrowthRows(ops, 1).map((r) => r.key)).toEqual(["b"]);
  });

  it("treats a missing packed size as unknown but zero added as known", () => {
    const rows = buildGrowthRows([
      indexOp("a", 1, {
        dataAdded: 20n,
        dataAddedPacked: 0n,
        totalBytesProcessed: 200n,
      }),
      indexOp("b", 2, {
        dataAdded: 0n,
        dataAddedPacked: 0n,
        totalBytesProcessed: 200n,
      }),
    ]);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r]));
    expect(byKey["a"].stored).toBeUndefined();
    expect(rowCost(byKey["a"])).toBe(20);
    expect(byKey["b"].stored).toBe(0);
  });
});

describe("summarizeGrowth", () => {
  it("totals the cost and finds the largest snapshot", () => {
    const rows = buildGrowthRows([
      indexOp("a", 1, {
        dataAdded: 10n,
        dataAddedPacked: 4n,
        totalBytesProcessed: 100n,
      }),
      indexOp("b", 2, {
        dataAdded: 90n,
        dataAddedPacked: 60n,
        totalBytesProcessed: 100n,
      }),
    ]);
    const s = summarizeGrowth(rows)!;
    expect(s.total).toBe(64);
    expect(s.average).toBe(32);
    expect(s.largest.key).toBe("b");
  });

  it("returns undefined for no rows", () => {
    expect(summarizeGrowth([])).toBeUndefined();
  });
});
