/**
 * The three craft in Earth orbit that are always bodies: the International Space Station, China's Tiangong station
 * and the Hubble Space Telescope. Each is placed by SGP4 from CelesTrak's current element set (sim/satellites), so
 * the card text here is all that is fixed. The satellites picked from the swarm get their records from
 * `swarmRecordText`.
 */
import type { BodyMission } from '../bodies';
import { orbitSummary, SAT_CLASSES, type GpRecord, type SatClass } from './omm';

export interface NamedCraft {
  id: string;
  /** NORAD catalogue number of the element set that places it. */
  norad: number;
  /** The CelesTrak query its elements come with. */
  query: { group: string } | { catnr: number };
  name: string;
  shortName?: string;
  aliases: string[];
  kindText: string;
  /** Half the largest dimension, km (the spacecraft convention of bodies.json). */
  radiusKm: number;
  sizeNote: string;
  massKg?: number;
  colour: string;
  craft: 'iss' | 'tiangong' | 'hubble';
  mission: BodyMission;
  facts: string[];
  factSources: string[];
  article?: string;
}

const NASA_ISS = 'https://www.nasa.gov/international-space-station/space-station-facts-and-figures/';
const HUBBLE_FACTS = 'https://science.nasa.gov/missions/hubble/a-nasa-refresher-on-hubble-facts-for-the-25th-anniversary/';

export const NAMED_CRAFT: NamedCraft[] = [
  {
    id: 'iss',
    norad: 25544,
    query: { group: 'stations' },
    name: 'International Space Station',
    shortName: 'ISS',
    aliases: ['ISS', 'Space station', 'Zarya'],
    kindText: 'Space station',
    radiusKm: 0.0545,
    sizeNote: '109 m end to end across its solar arrays; the truss is 94 m and the pressurised modules 67 m long (NASA).',
    massKg: 419_725,
    colour: '#dcd8cf',
    craft: 'iss',
    mission: {
      launch: '1998-11-20T06:40:00Z',
      vehicle: 'Proton-K (Zarya, the first module)',
      site: 'Baikonur Cosmodrome, Kazakhstan',
      summary: 'A laboratory in low Earth orbit built by NASA, Roscosmos, ESA, JAXA and the Canadian Space Agency, assembled from 1998.',
      status: 'Crewed without a break since 2 November 2000.',
      statusAsOf: '2026-10',
      statusSource: NASA_ISS,
    },
    facts: [
      'The station is 109 m from end to end and has a mass of 419,725 kg, with 1,005 m³ of pressurised volume.',
      'It goes round Earth about every 90 minutes, at about 7.7 km/s, so its crew sees about 16 sunrises and sunsets a day.',
      'People have lived aboard continuously since 2 November 2000.',
    ],
    factSources: [NASA_ISS, NASA_ISS, NASA_ISS],
  },
  {
    id: 'tiangong',
    norad: 48274,
    query: { group: 'stations' },
    name: 'Tiangong',
    aliases: ['Tiangong space station', 'China Space Station', 'CSS', 'Tianhe'],
    kindText: 'Space station',
    radiusKm: 0.028,
    sizeNote: 'Approximate: a T of three modules about 55 m across with its solar arrays.',
    colour: '#d9d4c8',
    craft: 'tiangong',
    mission: {
      launch: '2021-04-29T03:23:00Z',
      vehicle: 'Long March 5B (Tianhe, the core module)',
      site: 'Wenchang Spacecraft Launch Site, Hainan',
      summary: 'China’s space station: the Tianhe core module with the Wentian (July 2022) and Mengtian (October 2022) laboratory modules, in a T.',
      status: 'Crewed, with crews of three changing about every six months.',
      statusAsOf: '2026-10',
      statusSource: 'http://en.cmse.gov.cn/',
    },
    facts: [
      'Tiangong, “Heavenly Palace”, was assembled from three modules launched between April 2021 and October 2022, and completed in its T shape that November.',
      'It orbits about 41.5° to the equator, so it never passes over places much farther north or south than that, unlike the ISS at 51.6°.',
      'It is the third station China has flown, after the single-module Tiangong-1 (2011) and Tiangong-2 (2016).',
    ],
    factSources: ['http://en.cmse.gov.cn/', 'https://celestrak.org/NORAD/elements/gp.php?CATNR=48274', 'http://en.cmse.gov.cn/'],
  },
  {
    id: 'hubble',
    norad: 20580,
    query: { catnr: 20580 },
    name: 'Hubble Space Telescope',
    shortName: 'Hubble',
    aliases: ['Hubble', 'HST'],
    kindText: 'Space telescope',
    radiusKm: 0.00665,
    sizeNote: '13.3 m long and 4.2 m across (NASA); radius here is half the length.',
    massKg: 12_247,
    colour: '#cfd2d6',
    craft: 'hubble',
    mission: {
      launch: '1990-04-24T12:33:51Z',
      vehicle: 'Space Shuttle Discovery (STS-31)',
      site: 'Kennedy Space Center, Florida',
      summary: 'NASA and ESA’s optical and ultraviolet telescope, with a 2.4 m mirror, serviced by five Shuttle crews from 1993 to 2009.',
      status: 'Operating; its orbit is slowly decaying in the thin upper atmosphere.',
      statusAsOf: '2026-10',
      statusSource: 'https://science.nasa.gov/mission/hubble/',
    },
    facts: [
      'Hubble was carried up by the Space Shuttle Discovery on 24 April 1990 and released the next day.',
      'It is 13.3 m long, about the length of a large school bus, and has a mass of about 12,250 kg since its last servicing mission in 2009.',
      'Its 2.4 m mirror was ground slightly too flat; astronauts fitted corrective optics in December 1993.',
    ],
    factSources: [HUBBLE_FACTS, HUBBLE_FACTS, HUBBLE_FACTS],
    article: 'other-worlds',
  },
];

/** "8 October 2026, 23:34 UTC" from a Julian date. */
export function epochText(jd: number): string {
  const d = new Date((jd - 2440587.5) * 86400000);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

/** How far from the element set's epoch SGP4 is trusted (days): "approximate" within ±3, "illustrative" to ±30. */
export const GOOD_DAYS = 3;
export const SHOWN_DAYS = 30;

export function positionNoteOf(gp: GpRecord): string {
  return (
    `Position: SGP4 from the US Space Force’s element set of ${epochText(gp.epochJd)} (via CelesTrak), good to a few km within ` +
    `a day or two of it, drifting by tens to hundreds of km a day beyond as drag and manoeuvres change the orbit; not shown more than ${SHOWN_DAYS} days away.`
  );
}

/** One line of orbit: "421 × 425 km, 51.6°, 92.9 min". */
export function orbitLineText(gp: GpRecord): string {
  const s = orbitSummary(gp);
  const km = (x: number) => Math.round(x).toLocaleString('en-GB');
  return `${km(s.perigeeKm)} × ${km(s.apogeeKm)} km, ${gp.inclinationDeg.toFixed(1)}°, ${s.periodMin < 200 ? s.periodMin.toFixed(1) + ' min' : (s.periodMin / 60).toFixed(1) + ' h'}`;
}

/** A satellite picked from the swarm: what its card says. */
export function swarmRecordText(gp: GpRecord, cls: SatClass): { kindText: string; facts: string[] } {
  return {
    kindText: SAT_CLASSES[cls],
    facts: [
      `NORAD catalogue number ${gp.norad}; international designator ${gp.cosparId || 'not given'}.`,
      `Orbit (perigee × apogee above the equator, inclination, period): ${orbitLineText(gp)}.`,
    ],
  };
}
