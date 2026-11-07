import { Operation } from "../../../gen/ts/v1/operations_pb";

export interface GrowthRow {
  key: string;
  timeMs: number;
  host: string;
  plan: string;
  /** Size of the source data of the snapshot, bytes. */
  source: number;
  /** New data after dedup, before compression, bytes. */
  added: number;
  /** Bytes actually written to the repo (after compression); undefined if restic did not report it. */
  stored?: number;
}

/** Bytes this snapshot cost the repository: the packed size when known, else the deduplicated size. */
export const rowCost = (row: GrowthRow) => row.stored ?? row.added;

/**
 * Builds one row per indexed snapshot that carries a summary (restic >= 0.17), newest first.
 * Works on index-snapshot operations, so it also covers snapshots created outside Backrest.
 */
export const buildGrowthRows = (ops: Operation[], limit = 30): GrowthRow[] => {
  const rows: GrowthRow[] = [];
  for (const op of ops) {
    if (op.op.case !== "operationIndexSnapshot") continue;
    const snap = op.op.value.snapshot;
    const s = snap?.summary;
    if (!snap || !s) continue;
    const added = Number(s.dataAdded);
    const packed = Number(s.dataAddedPacked);
    rows.push({
      key: snap.id,
      timeMs: Number(snap.unixTimeMs),
      host: snap.hostname,
      plan: op.planId,
      source: Number(s.totalBytesProcessed),
      added,
      // packed === 0 while data was added means restic did not report it.
      stored: packed > 0 || added === 0 ? packed : undefined,
    });
  }
  rows.sort((a, b) => b.timeMs - a.timeMs);
  return rows.slice(0, limit);
};

export interface GrowthSummary {
  total: number;
  average: number;
  largest: GrowthRow;
}

export const summarizeGrowth = (
  rows: GrowthRow[],
): GrowthSummary | undefined => {
  if (rows.length === 0) return undefined;
  const total = rows.reduce((sum, r) => sum + rowCost(r), 0);
  const largest = rows.reduce((a, b) => (rowCost(b) > rowCost(a) ? b : a));
  return { total, average: total / rows.length, largest };
};
