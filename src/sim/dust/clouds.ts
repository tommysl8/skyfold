/**
 * The named dust clouds of the Sun's neighbourhood and the Radcliffe Wave, as bodies: each a quiet label at its
 * measured place (shown only near it: labelRange), a card with what it is, and a place to go to. The clouds
 * themselves are drawn by the dust map (render/dustLayer.ts), not by these records.
 *
 * Places: the median galactic longitude, latitude and distance of the cloud's sightlines in the compendium of Zucker
 * et al. (2020, A&A 633, A51, Table A.1: distances from Gaia DR2 parallaxes and stellar photometry); Orion's
 * sightlines split at b = −17.5° into Orion A (south, the Orion Nebula's cloud) and Orion B. Musca, which that table
 * has not got, is at 171 pc from Zucker et al. (2021, ApJ 919, 35), as quoted by Bonne et al. (2023, ApJ 948, 109),
 * at the galactic place of its filament's centre (12h 28m, −71° 18′). sim/dust/clouds.test.ts checks every place
 * against the dust map: along each line of sight the map's densest point lies within 25 pc of it (up to 9 %).
 */
import { LIGHT_YEAR_KM, PARSEC_KM } from '../../physics/constants';
import type { BodyRecord, DeepSkyInfo } from '../bodies/types';
import { fixedGalacticProvider } from '../galaxy/records';
import type { Vec3 } from '../galaxy/frames';
import { galPcFromLbd } from './volume';
import { RADCLIFFE_FIT, RADCLIFFE_LENGTH_PC, RADCLIFFE_RADIUS_PC, radcliffePoint } from './radcliffe';

const EDENHOFER = 'Edenhofer et al. 2024, A&A 685, A82';
const EDENHOFER_DOI = '10.1051/0004-6361/202347628';
const ZUCKER20 = 'Zucker et al. 2020, A&A 633, A51';
const ZUCKER20_DOI = '10.1051/0004-6361/201936145';
const doiUrl = (doi: string) => `https://doi.org/${doi}`;

export interface NamedCloud {
  id: string;
  name: string;
  aliases: readonly string[];
  /** Galactic longitude and latitude (degrees) and distance (pc). */
  l: number;
  b: number;
  dPc: number;
  /** The spread of its sightlines' distances, pc (lowest and highest). */
  dRangePc: [number, number];
  /** How many sightlines the place is the median of (0: a single value from the literature). */
  sightlines: number;
  /** Where the place comes from. */
  source: string;
  sourceDoi: string;
  /** About how far across the cloud is, pc (for framing; from the dust map's extent). */
  sizePc: number;
  /** One line for the card. */
  fact: string;
}

export const NAMED_CLOUDS: readonly NamedCloud[] = [
  {
    id: 'taurus-molecular-cloud',
    name: 'Taurus Molecular Cloud',
    aliases: ['Taurus clouds', 'Taurus dark clouds', 'TMC'],
    l: 171.6,
    b: -15.1,
    dPc: 148,
    dRangePc: [129, 170],
    sightlines: 10,
    source: ZUCKER20,
    sourceDoi: ZUCKER20_DOI,
    sizePc: 30,
    fact: 'The nearest large cloud where stars are being born, about 480 light-years away: dark filaments where Sun-like stars form a few at a time. The T Tauri stars, young stars still settling down, are named after one of its stars.',
  },
  {
    id: 'perseus-molecular-cloud',
    name: 'Perseus Molecular Cloud',
    aliases: ['Perseus cloud', 'Perseus clouds'],
    l: 159.6,
    b: -19.3,
    dPc: 285,
    dRangePc: [234, 347],
    sightlines: 18,
    source: ZUCKER20,
    sourceDoi: ZUCKER20_DOI,
    sizePc: 30,
    fact: 'A chain of dark clouds about 930 light-years away, with two young clusters, NGC 1333 and IC 348, still wrapped in their dust. It lies on the Radcliffe Wave.',
  },
  {
    id: 'orion-a-cloud',
    name: 'Orion A',
    aliases: ['Orion A cloud', 'Orion A molecular cloud', 'L1641'],
    l: 209.4,
    b: -19.6,
    dPc: 417,
    dRangePc: [394, 473],
    sightlines: 8,
    source: ZUCKER20,
    sourceDoi: ZUCKER20_DOI,
    sizePc: 90,
    fact: 'The nearest cloud making massive stars, about 1,400 light-years away and some 90 parsecs long: its head holds the Orion Nebula, its tail stretches away from us. It sits in the trough of the Radcliffe Wave, about 140 parsecs below the plane of the Galaxy.',
  },
  {
    id: 'orion-b-cloud',
    name: 'Orion B',
    aliases: ['Orion B cloud', 'Orion B molecular cloud', 'L1630'],
    l: 205.7,
    b: -14.8,
    dPc: 433,
    dRangePc: [399, 522],
    sightlines: 9,
    source: ZUCKER20,
    sourceDoi: ZUCKER20_DOI,
    sizePc: 50,
    fact: 'Orion A’s neighbour, about 1,400 light-years away: the cloud of the Horsehead and Flame nebulae and M78.',
  },
  {
    id: 'ophiuchus-cloud',
    name: 'Rho Ophiuchi Cloud',
    aliases: ['Ophiuchus cloud', 'Ophiuchus clouds', 'ρ Ophiuchi cloud', 'L1688'],
    l: 353.9,
    b: 15.8,
    dPc: 139,
    dRangePc: [109, 167],
    sightlines: 16,
    source: ZUCKER20,
    sourceDoi: ZUCKER20_DOI,
    sizePc: 20,
    fact: 'One of the nearest places where stars are being born, about 450 light-years away, above the Milky Way’s band near Antares: a dense core full of young stars with streamers of dust trailing from it.',
  },
  {
    id: 'lupus-clouds',
    name: 'Lupus Clouds',
    aliases: ['Lupus cloud', 'Lupus dark clouds'],
    l: 340.1,
    b: 12.4,
    dPc: 158,
    dRangePc: [108, 239],
    sightlines: 6,
    source: ZUCKER20,
    sourceDoi: ZUCKER20_DOI,
    sizePc: 30,
    fact: 'A loose group of dark clouds about 520 light-years away, at the edge of the Scorpius–Centaurus association of young stars, forming small stars in ones and twos.',
  },
  {
    id: 'chamaeleon-clouds',
    name: 'Chamaeleon Clouds',
    aliases: ['Chamaeleon cloud', 'Chamaeleon complex', 'Cha I'],
    l: 303.0,
    b: -15.3,
    dPc: 190,
    dRangePc: [161, 210],
    sightlines: 3,
    source: ZUCKER20,
    sourceDoi: ZUCKER20_DOI,
    sizePc: 25,
    fact: 'Three dark clouds about 620 light-years away, deep in the southern sky; the largest, Chamaeleon I, has made a few hundred young stars.',
  },
  {
    id: 'musca-cloud',
    name: 'Musca Cloud',
    aliases: ['Musca filament', 'Musca dark cloud'],
    l: 301.0,
    b: -8.5,
    dPc: 171,
    dRangePc: [171, 173],
    sightlines: 0,
    source: 'Zucker et al. 2021, ApJ 919, 35 (via Bonne et al. 2023, ApJ 948, 109)',
    sourceDoi: '10.3847/1538-4357/ac1f96',
    sizePc: 10,
    fact: 'A thin dark filament about 560 light-years away, some 8 parsecs long; seen side-on it looks like a perfect thread, but it is more likely a sheet seen edge-on.',
  },
  {
    id: 'cepheus-flare',
    name: 'Cepheus Flare',
    aliases: ['Cepheus clouds', 'Cepheus cloud'],
    l: 111.5,
    b: 17.6,
    dPc: 346,
    dRangePc: [331, 377],
    sightlines: 15,
    source: ZUCKER20,
    sourceDoi: ZUCKER20_DOI,
    sizePc: 40,
    fact: 'Clouds flaring above the plane of the Galaxy towards Cepheus, about 1,100 light-years away, a hundred parsecs above the plane.',
  },
];

/** A cloud's place, heliocentric galactic pc. */
export const cloudPc = (c: Pick<NamedCloud, 'l' | 'b' | 'dPc'>): Vec3 => galPcFromLbd(c.l, c.b, c.dPc);

/**
 * A cloud's label shows only from within this distance of it, km: 0.7 of its distance from the Sun, at most 120 pc,
 * so it shows on the way there and never from home (the sky from Earth keeps only what it always had).
 */
export const cloudLabelKm = (c: Pick<NamedCloud, 'dPc'>): number => Math.min(120, 0.7 * c.dPc) * PARSEC_KM;

const lightYearsText = (pc: number) => {
  const ly = (pc * PARSEC_KM) / LIGHT_YEAR_KM;
  return (ly >= 1000 ? Math.round(ly / 10) * 10 : Math.round(ly)).toLocaleString('en-GB');
};

/** A named cloud as a body. */
export function cloudRecord(c: NamedCloud): BodyRecord {
  const info: DeepSkyInfo = {
    type: 'Dark cloud of dust and gas',
    distancePc: c.dPc,
    distanceLoPc: c.dRangePc[0],
    distanceHiPc: c.dRangePc[1],
    distanceSource: c.sightlines > 0 ? `the median of its ${c.sightlines} sightlines (${c.source})` : c.source,
    sizes: [{ label: 'About this far across', pc: c.sizePc, title: 'Its extent in the dust map, roughly' }],
    cardNote: 'The cloud you see is the dust map’s; the label marks the place its distance was measured.',
    refs: [`${c.source} (place and distance)`, `${EDENHOFER} (the cloud, from the 3D dust map)`],
  };
  return {
    id: c.id,
    name: c.name,
    aliases: c.aliases,
    kind: 'nebula',
    kindText: 'Dark cloud',
    parent: null,
    // Small, so its label shows until the camera is well inside it; its framing is its whole extent.
    physical: { radiusKm: 0.1 * c.sizePc * PARSEC_KM, colour: '#a08060' },
    visual: { renderer: 'layer' },
    framing: { distanceKm: 1.6 * c.sizePc * PARSEC_KM },
    labelRange: { maxKm: cloudLabelKm(c) },
    detector: false,
    orbitLine: false,
    deepSky: info,
    facts: [c.fact],
    factSources: [doiUrl(c.sourceDoi), doiUrl(EDENHOFER_DOI)],
    factSourceLabels: [c.source.replace(/,.*$/, ''), 'Edenhofer et al. 2024'],
    positionNote: `Position: ${c.sightlines > 0 ? `the median of its sightlines in ${c.source}` : c.source}, ${lightYearsText(c.dPc)} light-years away, held fixed.`,
    modelNotes: [
      'The cloud is drawn from the 3D dust map of Edenhofer et al. (2024), the posterior mean, in voxels of 4 pc (10 pc beyond 400 pc): it dims what lies behind it and is faintly lit by the Galaxy’s starlight. Its finer structure is not resolved.',
    ],
    dataSource: `${c.source}; ${EDENHOFER}`,
    article: 'our-galaxy',
    provider: fixedGalacticProvider(cloudPc(c), 'Measured place, held fixed'),
  };
}

// ─── The Radcliffe Wave ──────────────────────────────────────────────────────────────────

export const RADCLIFFE_ID = 'radcliffe-wave';
const KONIETZKA = 'Konietzka et al. 2024, Nature 628, 62';
const KONIETZKA_DOI = '10.1038/s41586-024-07127-3';
const ALVES = 'Alves et al. 2020, Nature 578, 237';
const ALVES_DOI = '10.1038/s41586-019-1874-z';

/** Where its body is: the middle of the Wave's length. */
export const RADCLIFFE_MID_S = RADCLIFFE_LENGTH_PC / 2;

/** Its label shows only from out there: beyond 1 kpc from its middle (and within 8 kpc). */
export const RADCLIFFE_LABEL_KM = { minKm: 1000 * PARSEC_KM, maxKm: 8000 * PARSEC_KM };

export function radcliffeRecord(): BodyRecord {
  const mid = radcliffePoint(RADCLIFFE_MID_S);
  const lengthKpc = (RADCLIFFE_LENGTH_PC / 1000).toFixed(1);
  return {
    id: RADCLIFFE_ID,
    name: 'Radcliffe Wave',
    aliases: ['The Radcliffe Wave', 'Radcliffe wave'],
    kind: 'nebula',
    kindText: 'Wave of clouds',
    parent: null,
    // Its own radius (the scatter of its clouds), so its label shows from out there; its framing is its whole length.
    physical: { radiusKm: RADCLIFFE_RADIUS_PC * PARSEC_KM, colour: '#b09070' },
    visual: { renderer: 'layer' },
    framing: { distanceKm: 1.3 * RADCLIFFE_LENGTH_PC * PARSEC_KM },
    labelRange: RADCLIFFE_LABEL_KM,
    detector: false,
    orbitLine: false,
    deepSky: {
      type: 'A wave of gas and dust',
      sizes: [
        { label: 'Length', pc: RADCLIFFE_LENGTH_PC, title: `${lengthKpc} kpc in the plane (Konietzka et al. 2024’s model)` },
        { label: 'Greatest height from the plane', pc: RADCLIFFE_FIT.A, title: 'The amplitude of the model' },
        { label: 'Radius', pc: RADCLIFFE_RADIUS_PC, title: 'The scatter of its clouds about the model' },
      ],
      cardNote: 'Its line is Konietzka et al.’s model fitted to the clouds and young clusters; the clouds themselves are the dust map’s.',
      refs: [`${ALVES} (discovery)`, `${KONIETZKA} (the model and its oscillation)`, `${EDENHOFER} (the dust)`],
    },
    facts: [
      `A ${lengthKpc}-kiloparsec chain of the Sun’s nearest star-forming clouds, from Canis Major through Orion and Perseus to Cygnus, rising and falling through the plane of the Galaxy by up to about 220 parsecs. Found in 2020 in 3D maps of dust, it is oscillating: its young stars move up and down with it, like a wave travelling outwards through the Galaxy.`,
    ],
    factSources: [doiUrl(ALVES_DOI), doiUrl(KONIETZKA_DOI)],
    factSourceLabels: ['Alves et al. 2020', 'Konietzka et al. 2024'],
    positionNote: 'Position: the middle of the Wave along Konietzka et al. (2024)’s model, held fixed.',
    modelNotes: [
      'Its line is a model fitted to its clouds and young clusters (Konietzka et al. 2024), drawn as a faint line when you are out there and looking; its clouds scatter about it by some 50 parsecs.',
    ],
    dataSource: `${ALVES}; ${KONIETZKA}`,
    article: 'our-galaxy',
    provider: fixedGalacticProvider(mid, 'The middle of the Wave’s model line, held fixed'),
  };
}

/** Every body of the neighbourhood's dust: the named clouds and the Radcliffe Wave. */
export function dustRecords(): BodyRecord[] {
  return [...NAMED_CLOUDS.map(cloudRecord), radcliffeRecord()];
}
