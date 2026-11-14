const SERIES = "AIA0193";
const HOST = "https://sdo.gsfc.nasa.gov/assets/img/synoptic";

/** Carrington rotation ids, newest first, from the NASA synoptic page. */
export function carringtonRotations(html: string): string[] {
  const marker = `"${SERIES}":{"fits":[`;
  const at = html.indexOf(marker);
  if (at < 0) return [];
  const slice = html.slice(at, at + 800);
  const ids: string[] = [];
  for (const match of slice.matchAll(/CR\d{4}/g)) {
    const id = match[0];
    if (!ids.includes(id)) ids.push(id);
    if (ids.length === 3) break;
  }
  return ids;
}

/** Fixed NASA path for one published full-surface preview. */
export function carringtonMapUrl(rotation: string): string {
  return `${HOST}/${SERIES}/${rotationId(rotation)}.png`;
}

/** Fixed NASA path for the full-resolution science map of one solar turn. */
export function carringtonFitsUrl(rotation: string): string {
  return `${HOST}/${SERIES}/${rotationId(rotation)}.fits`;
}

function rotationId(rotation: string): string {
  if (!/^CR\d{4}$/.test(rotation)) {
    throw new Error("That is not a Carrington map id.");
  }
  return rotation;
}
