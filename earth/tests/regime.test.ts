import { describe, expect, it } from "vitest";
import { daysBetween, isIsoDate, regimeForDate } from "../data/regime";

describe("isIsoDate", () => {
  it("accepts a real day and rejects a calendar that rolls over", () => {
    expect(isIsoDate("2026-12-05")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true);
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("2026-04-31")).toBe(false);
    expect(isIsoDate("2025-02-29")).toBe(false);
  });
});

describe("daysBetween", () => {
  it("counts whole UTC days from today to the target", () => {
    expect(daysBetween("2026-12-01", "2026-12-01")).toBe(0);
    expect(daysBetween("2026-12-01", "2026-12-17")).toBe(16);
    expect(daysBetween("2026-12-01", "2026-12-18")).toBe(17);
    expect(daysBetween("2026-12-01", "2026-11-30")).toBe(-1);
  });
});

describe("regimeForDate", () => {
  const today = "2026-12-01";

  it("uses the forecast for today and the next 16 days", () => {
    expect(regimeForDate(today, today)).toBe("forecast");
    expect(regimeForDate("2026-12-17", today)).toBe("forecast");
  });

  it("uses the recorded day in the past and the date pattern further ahead", () => {
    expect(regimeForDate("2026-12-18", today)).toBe("typical-for-this-date");
    expect(regimeForDate("2026-11-30", today)).toBe("history");
  });

  it("rejects 31 February", () => {
    expect(() => regimeForDate("2026-02-31", today)).toThrow(/invalid date/i);
    expect(() => regimeForDate(today, "2026-02-31")).toThrow(Error);
  });
});
