import { describe, expect, it } from "vitest";
import {
  computeSnapshotSavings,
  formatBytes,
  formatPercent,
  formatReductionRatio,
  formatDate,
  formatDuration,
  formatMonth,
  formatTime,
  localISOTime,
  normalizeSnapshotId,
} from "./formatting";

describe("formatBytes", () => {
  it("returns 0B for zero, undefined, and falsy inputs", () => {
    expect(formatBytes(0)).toBe("0B");
    expect(formatBytes(undefined)).toBe("0B");
  });

  it("keeps small values in bytes", () => {
    expect(formatBytes(1)).toBe("1 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("does not convert at exactly 1024 (strict > boundary)", () => {
    expect(formatBytes(1024)).toBe("1024 B");
  });

  it("crosses the KiB boundary just above 1024", () => {
    expect(formatBytes(1025)).toBe("1 KiB");
  });

  it("does not convert at exactly 1024 KiB", () => {
    expect(formatBytes(1024 * 1024)).toBe("1024 KiB");
  });

  it("crosses the MiB boundary just above 1024 KiB", () => {
    expect(formatBytes(1024 * 1024 + 1)).toBe("1 MiB");
  });

  it("does not convert at exactly 1024 MiB", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1024 MiB");
  });

  it("crosses the GiB boundary just above 1024 MiB", () => {
    expect(formatBytes(1024 * 1024 * 1024 + 1)).toBe("1 GiB");
  });

  it("rounds to 2 decimal places", () => {
    // 1500 bytes -> 1.46484375 KiB, rounded to 1.46
    expect(formatBytes(1500)).toBe("1.46 KiB");
  });

  it("parses string input", () => {
    expect(formatBytes("2048")).toBe("2 KiB");
  });
});

describe("formatDuration", () => {
  it("returns an empty string for falsy, non-zero-safe input", () => {
    expect(formatDuration(undefined as unknown as number)).toBe("");
    expect(formatDuration(null as unknown as number)).toBe("");
  });

  it("treats an explicit zero duration as 0 of the min unit", () => {
    expect(formatDuration(0)).toBe("0s");
  });

  it("formats sub-minute durations in seconds (fast path)", () => {
    expect(formatDuration(1000)).toBe("1s");
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(59_000)).toBe("59s");
  });

  it("formats minutes and seconds once at or above a minute", () => {
    expect(formatDuration(60_000)).toBe("1m");
    expect(formatDuration(90_000)).toBe("1m30s");
  });

  it("formats hours, minutes, and seconds", () => {
    expect(formatDuration(3_661_000)).toBe("1h1m1s");
  });

  it("formats negative durations with a leading minus sign (fast path applies below 60s magnitude check)", () => {
    // Note: the fast path only checks `ms < 60_000`, which is also true for any
    // negative value, so negative durations always render in seconds unless
    // options are supplied.
    expect(formatDuration(-90_000)).toBe("-90s");
  });

  it("respects minUnit to drop smaller units", () => {
    expect(formatDuration(3_661_000, { minUnit: "m" })).toBe("1h1m");
    expect(formatDuration(-90_000, { minUnit: "m" })).toBe("-1m");
  });

  it("respects maxUnit to drop larger units", () => {
    // 90_000_000ms = 1 day 1 hour; capping at "h" hides the day component.
    expect(formatDuration(90_000_000)).toBe("1d1h");
    expect(formatDuration(90_000_000, { maxUnit: "h" })).toBe("1h");
  });
});

describe("normalizeSnapshotId", () => {
  it("truncates a snapshot id to 8 characters", () => {
    expect(normalizeSnapshotId("abcdef1234567890")).toBe("abcdef12");
  });

  it("returns the whole string when shorter than 8 characters", () => {
    expect(normalizeSnapshotId("abc")).toBe("abc");
  });

  it("returns an empty string for empty input", () => {
    expect(normalizeSnapshotId("")).toBe("");
  });
});

describe("formatDate", () => {
  it("formats a fixed timestamp as a date-only string", () => {
    // 2021-01-15T00:00:00.000Z
    const result = formatDate(1610668800000);
    expect(result).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it("accepts string and Date inputs equivalently to number", () => {
    const ms = 1610668800000;
    expect(formatDate(String(ms))).toBe(formatDate(ms));
    expect(formatDate(new Date(ms))).toBe(formatDate(ms));
  });
});

describe("formatMonth", () => {
  it("formats a fixed timestamp as a month/year string", () => {
    // 2021-01-15T00:00:00.000Z
    const result = formatMonth(1610668800000);
    expect(result).toMatch(/^\d{2}\/\d{4}$/);
  });
});

describe("formatTime", () => {
  it("formats a fixed timestamp including date and time components", () => {
    const result = formatTime(1610668800000);
    // Locale-dependent, but should contain a date and an hour:minute pairing.
    expect(result).toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe("localISOTime", () => {
  it("returns a valid ISO 8601 string", () => {
    const result = localISOTime(1610668800000);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("is consistent across number, string, and Date input forms", () => {
    const ms = 1610668800000;
    expect(localISOTime(String(ms))).toBe(localISOTime(ms));
    expect(localISOTime(new Date(ms))).toBe(localISOTime(ms));
  });
});

describe("computeSnapshotSavings", () => {
  const GiB = 1024 ** 3;

  it("derives dedup, compression and total savings", () => {
    const s = computeSnapshotSavings({
      totalBytesProcessed: 100 * GiB,
      dataAdded: 10 * GiB,
      dataAddedPacked: 4 * GiB,
    })!;
    expect(s.dedupRatio).toBeCloseTo(0.9);
    expect(s.compressionRatio).toBeCloseTo(0.6);
    expect(s.savedRatio).toBeCloseTo(0.96);
  });

  it("accepts bigint inputs", () => {
    const s = computeSnapshotSavings({
      totalBytesProcessed: 200n,
      dataAdded: 20n,
      dataAddedPacked: 10n,
    })!;
    expect(s.savedRatio).toBeCloseTo(0.95);
  });

  it("leaves packed-derived values undefined when restic did not report packed size", () => {
    const s = computeSnapshotSavings({
      totalBytesProcessed: 100,
      dataAdded: 10,
      dataAddedPacked: 0,
    })!;
    expect(s.dedupRatio).toBeCloseTo(0.9);
    expect(s.packedBytes).toBeUndefined();
    expect(s.compressionRatio).toBeUndefined();
    expect(s.savedRatio).toBeUndefined();
  });

  it("treats an unchanged snapshot (nothing added) as 100% saved", () => {
    const s = computeSnapshotSavings({
      totalBytesProcessed: 100,
      dataAdded: 0,
      dataAddedPacked: 0,
    })!;
    expect(s.dedupRatio).toBe(1);
    expect(s.savedRatio).toBe(1);
    expect(s.compressionRatio).toBeUndefined();
  });

  it("returns undefined without a source size", () => {
    expect(computeSnapshotSavings({ totalBytesProcessed: 0 })).toBeUndefined();
  });
});

describe("formatPercent", () => {
  it("formats ratios and n/a", () => {
    expect(formatPercent(0.9456)).toBe("94.6%");
    expect(formatPercent(undefined)).toBe("n/a");
  });
});

describe("formatReductionRatio", () => {
  it("rounds the source/stored ratio", () => {
    expect(formatReductionRatio(1000, 4)).toBe("250 : 1");
    expect(formatReductionRatio(1000, 3)).toBe("333 : 1");
  });

  it("returns undefined for zero or unknown stored size", () => {
    expect(formatReductionRatio(1000, 0)).toBeUndefined();
    expect(formatReductionRatio(1000, undefined)).toBeUndefined();
  });
});
