/**
 * The supernovae and the kilonova as bodies (kind 'transient'): where each is, a point of light whose brightness and
 * colour follow its light curve (the record's `luminous`, rewritten each frame by index.ts), and the card's words. Pure
 * functions of the data (supernovae.ts, kilonova.ts); registered at start-up (index.ts registerPhenomena).
 */
import type { AstroTime } from 'astronomy-engine';
import { MPC_KM, PARSEC_KM } from '../../physics/constants';
import { msFromAstroTime } from '../../lib/time';
import { ALWAYS } from '../bodies/providers/simple';
import type { BodyRecord, PositionProvider, Vec3Like } from '../bodies/types';
import { raDecToWorld } from '../frames';
import { cosmicAtMemo } from '../cosmicTime';
import { KN_DISTANCE_PC, M1_MSUN, M2_MSUN, MERGER_MS } from './kilonova';
import { NONE } from './lightCurve';
import { remnantRadiusKm, type Supernova } from './supernovae';

/** A place held fixed (heliocentric, km) at RA/Dec and a distance: J2000 ecliptic from world axes (x, y, z) = ecliptic (x, z, −y). */
function fixedProvider(raDeg: number, decDeg: number, distanceKm: number, label: string): PositionProvider {
  const w = raDecToWorld(raDeg, decDeg).multiplyScalar(distanceKm);
  const e = [w.x, -w.z, w.y];
  return {
    label,
    static: true,
    availability: () => ALWAYS.approximate,
    positionAt(_t: AstroTime, pos: Vec3Like, vel?: Vec3Like | null) {
      pos.x = e[0];
      pos.y = e[1];
      pos.z = e[2];
      if (vel) vel.x = vel.y = vel.z = 0;
    },
  };
}

const DATE = (ms: number) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

/** A supernova as a body: at the remnant, sized as today's remnant, shining as its light curve says. */
export function supernovaRecord(sn: Supernova): BodyRecord {
  const rKm = remnantRadiusKm(sn);
  return {
    id: sn.id,
    name: sn.name,
    aliases: sn.aliases,
    kind: 'transient',
    kindText: `Supernova · seen ${new Date(sn.firstSeenMs).getUTCFullYear()}`,
    parent: null,
    physical: {
      radiusKm: rKm,
      colour: '#ffd9a0',
      // Rewritten each frame from the light curve (index.ts updatePhenomena): V as seen from Earth, at Earth's distance.
      luminous: { vmag: NONE, atKm: sn.distancePc * PARSEC_KM, teffK: 6000, variable: true },
    },
    visual: { renderer: 'point' },
    // As close as a million km: the fireball of its first days is smaller than the Solar System.
    framing: { distanceKm: 6 * rKm, minKm: 1e6 },
    labelRank: 9,
    detector: false,
    orbitLine: false,
    deepSky: {
      type: sn.typeText,
      distancePc: sn.distancePc,
      distanceLoPc: sn.distanceLoPc,
      distanceHiPc: sn.distanceHiPc,
      distanceSource: sn.distanceSource,
      ...(sn.id === 'supernova-1987a' ? { hostGalaxy: 'Large Magellanic Cloud' } : {}),
      rows: [
        { l: 'First seen', v: DATE(sn.firstSeenMs), title: sn.firstSeenText },
        { l: 'Brightest from Earth', v: `V ${Math.min(...sn.curve.vmag).toFixed(1).replace('-', '−')}`, title: sn.peakText },
        { l: 'Seen for', v: sn.seenForText },
        { l: 'Remnant now', v: `${((2 * rKm) / PARSEC_KM).toFixed(1)}`, u: 'pc across', title: sn.remnant.source },
      ],
      cardNote: 'Its light from Earth follows the recorded light curve; up close the explosion and its debris are a model.',
      refs: [...sn.curveSources, `${sn.typeSource} (type)`, `${sn.positionSource} (position)`, `${sn.ejectaSource} (speeds)`, `${sn.remnant.source} (remnant)`],
    },
    facts: sn.facts,
    factSources: sn.factSources,
    factSourceLabels: sn.factSourceLabels,
    dataSource: sn.curveSources[0],
    positionNote: `Position: ${sn.positionSource}, at ${sn.distancePc.toLocaleString('en-GB')} pc, held fixed.`,
    modelNotes: [
      `First seen ${sn.firstSeenText}. Seen for ${sn.seenForText}.`,
      `Its brightness and colour seen from Earth follow its light curve: ${sn.peakText}. ${sn.explosionNote}.`,
      sn.pictureRemnant
        ? 'Up close: its fireball as large and as bright as its light curve and the photosphere’s speed give; the nebula it left is its picture, drawn at the size the filaments’ expansion gives for the date.'
        : 'Up close (a model): its fireball, then its debris, the forward shock growing to today’s remnant at the speeds measured (free expansion, then the expansion parameter of its proper motions). The remnant shines mostly in X-rays: its shell is shown in false colour.',
      'Its age is counted from when its light reached Earth, as the deep sky is drawn as Earth sees it: at the remnant itself the explosion was earlier by the light’s travel time.',
    ],
    article: 'what-stars-are-made-of',
    provider: fixedProvider(sn.raDeg, sn.decDeg, sn.distancePc * PARSEC_KM, 'Fixed at its remnant’s position and distance'),
  };
}

// ─── The kilonova ─────────────────────────────────────────────────────────────────────

export const KILONOVA_ID = 'at2017gfo';

/**
 * Where the kilonova is: the gravitational-wave catalogue's place for GW170817 (sim/deepsky gw-events.json.gz: NGC 4993's
 * direction at the waves' comoving distance, 39.645 Mpc, world axes, Mpc), carried by the expansion of the universe as
 * that merger's region is, so the two coincide (kilonova.test.ts checks it against the file).
 */
export const GW170817_POS_MPC: readonly [number, number, number] = [-34.714, -10.0959, 16.2696];

function expandingProvider(posMpc: readonly number[]): PositionProvider {
  const x = [posMpc[0] * MPC_KM, -posMpc[2] * MPC_KM, posMpc[1] * MPC_KM];
  return {
    label: 'NGC 4993, carried by the expansion of the universe',
    availability: () => ALWAYS.approximate,
    positionAt(t: AstroTime, pos: Vec3Like, vel?: Vec3Like | null) {
      const k = 1 + cosmicAtMemo(msFromAstroTime(t)).am1;
      pos.x = x[0] * k;
      pos.y = x[1] * k;
      pos.z = x[2] * k;
      if (vel) vel.x = vel.y = vel.z = 0;
    },
  };
}

export function kilonovaRecord(): BodyRecord {
  return {
    id: KILONOVA_ID,
    name: 'AT 2017gfo',
    aliases: ['kilonova', 'GW170817 kilonova', 'SSS17a', 'DLT17ck', 'neutron star merger', 'NGC 4993 kilonova', 'GRB 170817A'],
    kind: 'transient',
    kindText: 'Kilonova · GW170817',
    parent: null,
    // Its debris after a year at 0.1–0.3c, for framing.
    physical: { radiusKm: 2e12, colour: '#ffb3c8' },
    visual: { renderer: 'point' },
    framing: { distanceKm: 3e10, minKm: 200 },
    labelRank: 11,
    detector: false,
    orbitLine: false,
    deepSky: {
      type: 'Kilonova: two neutron stars merged',
      distancePc: KN_DISTANCE_PC,
      distanceSource: 'its galaxy NGC 4993, 40.7 Mpc from the brightness fluctuations of its stars (Cantiello et al. 2018, ApJL 854, L31); placed where the gravitational-wave catalogue places GW170817',
      hostGalaxy: 'NGC 4993',
      rows: [
        { l: 'Merger seen', v: '17 Aug 2017, 12:41:04 UTC', title: 'Abbott et al. 2017, PRL 119, 161101' },
        { l: 'Masses', v: `${M1_MSUN} + ${M2_MSUN}`, u: 'M☉', title: 'GWTC-1, low-spin prior (Abbott et al. 2019, PRX 9, 011001)' },
        { l: 'Peak', v: 'M_V ≈ −16', title: 'Drout et al. 2017, Science 358, 1570: −16.04 ± 0.23 within half a day' },
      ],
      cardNote: 'The inspiral and the glow follow the measurements; the shapes of the debris, the stars’ look and the slowed orbit are a model.',
      refs: [
        'Abbott et al. 2017, PRL 119, 161101 (the merger)',
        'Abbott et al. 2019, PRX 9, 011001 (masses, chirp mass, inclination)',
        'Coulter et al. 2017, Science 358, 1556 (the kilonova found, 10.9 hours on)',
        'Waxman et al. 2018, MNRAS 481, 3423 (temperature, luminosity and radius against time)',
        'Drout et al. 2017, Science 358, 1570 (light curves)',
        'Kasen et al. 2017, Nature 551, 80; Villar et al. 2017, ApJL 851, L21 (the two components)',
        'Margalit & Metzger 2017, ApJL 850, L19 (the remnant)',
      ],
    },
    facts: [
      'On 17 August 2017 gravitational waves from two neutron stars spiralling together were heard for about 100 seconds; 1.7 s after they merged a faint gamma-ray burst arrived.',
      'Eleven hours later telescopes found its light in NGC 4993: a kilonova, blue at first, then fading to red within days as the gold, platinum and other heavy elements made in it dimmed the blue light.',
      'What was left is most likely a black hole, after a neutron star too heavy to last more than a moment.',
    ],
    factSources: ['https://doi.org/10.1103/PhysRevLett.119.161101', 'https://doi.org/10.1126/science.aap9811', 'https://doi.org/10.3847/2041-8213/aa991c'],
    factSourceLabels: ['Abbott et al. 2017', 'Coulter et al. 2017', 'Margalit & Metzger 2017'],
    dataSource: 'Abbott et al. 2017, 2019; Waxman et al. 2018',
    positionNote: 'Position: NGC 4993 (OpenNGC) at the gravitational waves’ distance, as the catalogue places GW170817; carried by the expansion of the universe.',
    modelNotes: [
      'The inspiral follows the chirp of the measured masses (the quadrupole formula) at its real pace in time, but the stars are drawn turning 100 times slower than they did (12 to 800 orbits a second at the end), so they can be followed. Their look is a model: their temperature is not known.',
      'The glow’s brightness, colour and size follow the blackbody fits to its light; its shape, a fast blue part towards the poles and a slower red one round the waist, is a model (Kasen et al. 2017), and one-part models fit the light too.',
      `From Earth it peaked at about magnitude 17: far too faint to see without a telescope. The merger was seen on ${DATE(MERGER_MS)}; the age here is counted from then.`,
    ],
    article: 'black-holes',
    provider: expandingProvider(GW170817_POS_MPC),
  };
}
