import { describe, expect, it } from "vitest";
import { parsePowerMonth } from "../data/power";

const payload = {
  properties: {
    parameter: {
      PRECTOTCORR: { JAN: 1.2, FEB: -999, MAR: 4 },
      T2M: { JAN: 10, FEB: 11, MAR: -999 },
      WS10M: { JAN: 4.5, FEB: 5, MAR: 6 },
      CLOUD_AMT: { JAN: 0, FEB: 50, MAR: 60 },
    },
  },
};

describe("parsePowerMonth", () => {
  it("reads the named month and turns -999 into null", () => {
    expect(parsePowerMonth(payload, 0)).toEqual({
      precipitationMm: 1.2,
      cloudCoverPercent: 0,
      windSpeedMs: 4.5,
      temperatureC: 10,
    });
    expect(parsePowerMonth(payload, 1)).toEqual({
      precipitationMm: null,
      cloudCoverPercent: 50,
      windSpeedMs: 5,
      temperatureC: 11,
    });
    expect(parsePowerMonth(payload, 2).temperatureC).toBeNull();
  });

  it("returns nulls for a wrong shape and does not throw", () => {
    expect(parsePowerMonth(null, 0)).toEqual({
      precipitationMm: null,
      cloudCoverPercent: null,
      windSpeedMs: null,
      temperatureC: null,
    });
    expect(parsePowerMonth({ properties: {} }, 11)).toEqual({
      precipitationMm: null,
      cloudCoverPercent: null,
      windSpeedMs: null,
      temperatureC: null,
    });
    expect(() => parsePowerMonth("nope", 0)).not.toThrow();
  });
});
