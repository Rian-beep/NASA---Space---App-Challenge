import type { ScenarioInput } from "@/lib/science/types";
import catalog from "./missions.json";

/** NASA NSSDCA table of spacecraft on the Moon. Unknown locations are left out. */
export const MISSION_SOURCE_URL =
  "https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_artifact_impacts.html";

export const MOON_IMAGE_CREDIT =
  "Moon color from the NASA LRO wide-angle camera (SVS 4720). Hill shading from NASA LOLA.";

export type MissionOutcome = "crewed_landing" | "soft_landing" | "rover" | "lander" | "impact";

export interface MissionSite {
  id: string;
  name: string;
  outcome: MissionOutcome;
  dateUtc: string;
  program: string;
  country: string;
  latitudeDeg: number;
  eastLongitudeDeg: number;
  place: string;
  caveat: string;
}

export const MISSIONS: readonly MissionSite[] = catalog as MissionSite[];

const byId = new Map(MISSIONS.map((mission) => [mission.id, mission]));

export function missionById(id: string): MissionSite | undefined {
  return byId.get(id);
}

export function isImpact(outcome: MissionOutcome): boolean {
  return outcome === "impact";
}

export function outcomePhrase(outcome: MissionOutcome): string {
  switch (outcome) {
    case "crewed_landing":
      return "Crewed landing";
    case "soft_landing":
      return "Soft landing";
    case "rover":
      return "Rover";
    case "lander":
      return "Reached the surface";
    case "impact":
      return "Impact";
  }
}

export function missionPrograms(): string[] {
  const seen: string[] = [];
  for (const mission of MISSIONS) {
    if (!seen.includes(mission.program)) seen.push(mission.program);
  }
  return seen;
}

export function scenarioPatchForMission(
  mission: MissionSite,
): Pick<ScenarioInput, "siteId" | "name" | "customSite"> {
  return {
    siteId: mission.id,
    name: mission.name,
    customSite: {
      name: mission.name,
      eastLongitudeDeg: mission.eastLongitudeDeg,
      latitudeDeg: mission.latitudeDeg,
      surfaceHeightM: 0,
    },
  };
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function formatMissionDate(dateUtc: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateUtc);
  if (!match) return dateUtc;
  const month = MONTHS[Number(match[2]) - 1];
  if (!month) return dateUtc;
  return `${Number(match[3])} ${month} ${match[1]}`;
}
