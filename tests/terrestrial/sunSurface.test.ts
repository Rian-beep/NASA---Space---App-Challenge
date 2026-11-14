import { describe, expect, it } from "vitest";
import { carringtonMapUrl, carringtonRotations } from "../../terrestrial/sunSurface";

const PAGE = `
{"AIA0171":{"fits":["CR1000.fits"]},"AIA0193":{"fits":["CR2311.fits","CR2310.fits","CR2309.fits"]}}
`;

describe("carrington surface map", () => {
  it("reads the newest full-surface maps first", () => {
    expect(carringtonRotations(PAGE)).toEqual(["CR2311", "CR2310", "CR2309"]);
    expect(carringtonRotations("no maps")).toEqual([]);
  });

  it("only builds the fixed NASA path", () => {
    expect(carringtonMapUrl("CR2311")).toBe(
      "https://sdo.gsfc.nasa.gov/assets/img/synoptic/AIA0193/CR2311.png",
    );
    expect(() => carringtonMapUrl("../secret")).toThrow();
  });
});
