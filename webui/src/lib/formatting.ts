const units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
export const formatBytes = (bytes?: number | string) => {
  if (!bytes) {
    return "0B";
  }
  if (typeof bytes === "string") {
    bytes = parseInt(bytes);
  }

  let unit = 0;
  while (bytes > 1024) {
    bytes /= 1024;
    unit++;
  }
  return `${Math.round(bytes * 100) / 100} ${units[unit]}`;
};

const fmtHourMinute = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const timezoneOffsetMs = new Date().getTimezoneOffset() * 60 * 1000;
// formatTime formats a time as YYYY-MM-DD at HH:MM AM/PM
export const formatTime = (time: number | string | Date) => {
  if (typeof time === "string") {
    time = parseInt(time);
  } else if (time instanceof Date) {
    time = time.getTime();
  }
  const d = new Date(time);
  return fmtHourMinute.format(d);
};

export const localISOTime = (time: number | string | Date) => {
  if (typeof time === "string") {
    time = parseInt(time);
  } else if (time instanceof Date) {
    time = time.getTime();
  }

  const d = new Date();
  d.setTime(time - timezoneOffsetMs);
  return d.toISOString();
};

const fmtDate = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export const formatDate = (time: number | string | Date) => {
  if (typeof time === "string") {
    time = parseInt(time);
  } else if (time instanceof Date) {
    time = time.getTime();
  }
  let d = new Date();
  d.setTime(time);
  return fmtDate.format(d);
};

const fmtMonth = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "2-digit",
});
export const formatMonth = (time: number | string | Date) => {
  if (typeof time === "string") {
    time = parseInt(time);
  } else if (time instanceof Date) {
    time = time.getTime();
  }
  let d = new Date();
  d.setTime(time);
  return fmtMonth.format(d);
};

const durationSteps = [1000, 60, 60, 24, Number.MAX_VALUE];
const durationFactors = [
  1,
  1000,
  60 * 1000,
  60 * 60 * 1000,
  24 * 60 * 60 * 1000,
];
const shortDurationUnits = ["ms", "s", "m", "h", "d"];
type DurationUnit = (typeof shortDurationUnits)[number];

export interface FormatDurationOptions {
  minUnit?: DurationUnit;
  maxUnit?: DurationUnit;
}

export const formatDuration = (ms: number, options?: FormatDurationOptions) => {
  if (!ms && ms !== 0) return "";

  if (!options && ms < 60 * 1000) {
    // If no options and less than a minute, show seconds
    // Performance optimization
    return `${Math.round(ms / 1000)}s`;
  }

  const minUnitIndex = options?.minUnit
    ? shortDurationUnits.indexOf(options.minUnit)
    : 1; // Don't show ms by default
  const maxUnitIndex = options?.maxUnit
    ? shortDurationUnits.indexOf(options.maxUnit)
    : shortDurationUnits.length - 1;

  const absMs = Math.abs(ms);
  let result = "";

  for (let i = maxUnitIndex; i >= minUnitIndex; i--) {
    const value = Math.floor(absMs / durationFactors[i]) % durationSteps[i];
    if (value > 0) {
      result += `${value}${shortDurationUnits[i]}`;
    }
  }

  if (!result) {
    result = `0${shortDurationUnits[minUnitIndex]}`;
  }

  return ms < 0 ? `-${result}` : result;
};

export const normalizeSnapshotId = (id: string) => {
  return id.substring(0, 8);
};

export interface SnapshotSavings {
  /** Size of the source data ("frontend" size), bytes. */
  sourceBytes: number;
  /** Bytes added after dedup, before compression. */
  dedupedBytes: number;
  /** Bytes actually written to the repo after dedup AND compression; undefined if restic did not report it. */
  packedBytes?: number;
  /** Fraction (0-1) of the source avoided by dedup alone. */
  dedupRatio: number;
  /** Fraction (0-1) saved by compression on the deduplicated data; undefined if not computable. */
  compressionRatio?: number;
  /** Fraction (0-1) of the source not written to the repo (dedup + compression); undefined if packed size unknown. */
  savedRatio?: number;
}

/**
 * Derives dedup / compression figures from a snapshot summary.
 * Returns undefined when there is no source size to compare against.
 * data_added_packed is only reported by restic >= 0.17 (and compression only
 * exists on repo format v2), so packed-derived values are optional.
 */
export const computeSnapshotSavings = (summary: {
  totalBytesProcessed?: number | bigint;
  dataAdded?: number | bigint;
  dataAddedPacked?: number | bigint;
}): SnapshotSavings | undefined => {
  const sourceBytes = Number(summary.totalBytesProcessed ?? 0);
  const dedupedBytes = Number(summary.dataAdded ?? 0);
  const packed = Number(summary.dataAddedPacked ?? 0);
  if (sourceBytes <= 0) {
    return undefined;
  }
  // packed === 0 while data was added means restic did not report it.
  const packedKnown = packed > 0 || dedupedBytes === 0;
  const packedBytes = packedKnown ? packed : undefined;
  return {
    sourceBytes,
    dedupedBytes,
    packedBytes,
    dedupRatio: 1 - dedupedBytes / sourceBytes,
    compressionRatio:
      packedBytes !== undefined && dedupedBytes > 0
        ? 1 - packedBytes / dedupedBytes
        : undefined,
    savedRatio:
      packedBytes !== undefined ? 1 - packedBytes / sourceBytes : undefined,
  };
};

export const formatPercent = (ratio?: number) =>
  ratio === undefined || !isFinite(ratio)
    ? "n/a"
    : `${(ratio * 100).toFixed(1)}%`;
