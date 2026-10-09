/**
 * The complete Solar System registered from the shipped data: every body and scene target, the
 * positions (moons about their planets exactly as the fitted models say, Pluto and Charon about
 * their barycentre, flybys at the right distances), the regimes where the data end, the
 * rotation models, rings, notes and lists, and the per-frame cost.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { Quaternion, Vector3 } from 'three';
import { msFromCivil } from '../../lib/time';
import { astroTimeAt } from '../../lib/time';
import { articleForBody } from '../../content/bodyArticles';
import { findDestination, nestedDestinations, searchDestinations } from '../../content/destinations';
import { KNOWN_TARGETS, resolveTarget } from '../../content/scenes';
import { locationPath } from '../../ui/location';
import { radiusReading } from '../../ui/dataSheet';
import { readBytes, readJson } from '../../test/files';
import { updateEphemeris } from '../ephemeris';
import { evalMoon, indexMoonCatalog, type MoonCatalog } from '../moonModels';
import { setSimTime, sim } from '../sim';
import { parseTracks, type TracksIndex } from '../tracks';
import { PLUTO_BARYCENTRE, bodyAvailability, bodyIds, bodyPositionAt, bodyRecord, getBody, isBody, systemOf, type BodyRecord } from '../bodies';
import { entryOf } from '../bodies/registry';
import { fittedMoonProvider, registerSolarSystem, solarSystemIds, twoFigures, type BodiesFile, type RingsFile } from '.';

const bodies = readJson<BodiesFile>('public/data/bodies.json');
const rings = readJson<RingsFile>('public/data/rings.json');
const moons = indexMoonCatalog(readJson<MoonCatalog>('public/data/moons.json'));
const tracks = parseTracks(readJson<TracksIndex>('public/data/tracks.json'), readBytes('public/data/tracks.bin'));

const T0 = msFromCivil(2026, 9, 25, 12);

function at(ms: number): void {
  setSimTime(ms);
  updateEphemeris();
}

/** A body's position relative to another, J2000 ecliptic km. */
function relEcl(id: string, from: string): [number, number, number] {
  const a = sim.bodies[id]?.pos ?? entryOf(id)!.state.pos;
  const b = sim.bodies[from]?.pos ?? entryOf(from)!.state.pos;
  const d = a.clone().sub(b);
  return [d.x, -d.z, d.y];
}

const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const norm = (a: number[]) => Math.hypot(a[0], a[1], a[2]);

beforeAll(() => {
  registerSolarSystem({ bodies, rings, moons, tracks });
  at(T0);
});

describe('registration', () => {
  it('adds every body of the data, and every Solar System scene target resolves', () => {
    for (const b of bodies.bodies) expect(isBody(b.id), b.id).toBe(true);
    expect(solarSystemIds()).toHaveLength(bodies.bodies.length - 1); // Voyager 1 was built in: it is replaced
    const solar = KNOWN_TARGETS.slice(0, KNOWN_TARGETS.indexOf('jwst') + 1);
    for (const id of solar) expect(resolveTarget(id), id).not.toBeNull();
  });

  it('can register again (a second load replaces the first)', () => {
    const n = bodyIds().length;
    const notes = bodyRecord('jupiter').modelNotes?.length;
    registerSolarSystem({ bodies, rings, moons, tracks });
    at(T0);
    expect(bodyIds()).toHaveLength(n);
    expect(bodyRecord('jupiter').modelNotes?.length).toBe(notes);
  });

  it('keeps the built-in bodies’ keys, and lists moons right after their planet', () => {
    expect(bodyRecord('voyager1').key).toBe('V');
    expect(bodyRecord('pluto').key).toBe('9');
    const ids = [...bodyIds()];
    const s = ids.indexOf('saturn');
    expect(ids.slice(s, s + 9)).toEqual(['saturn', 'mimas', 'enceladus', 'tethys', 'dione', 'rhea', 'titan', 'hyperion', 'iapetus']);
    expect(ids.slice(ids.indexOf('pluto'), ids.indexOf('pluto') + 4)).toEqual(['pluto', 'charon', 'nix', 'hydra']);
  });
});

describe('positions', () => {
  it('places every moon about its planet exactly where its fitted model says', () => {
    for (const ms of [T0, msFromCivil(1990, 3, 1), msFromCivil(2150, 7, 4)]) {
      at(ms);
      const t = sim.astroTime.tt;
      for (const b of bodies.bodies) {
        if (b.kind !== 'moon') continue;
        const centre = b.parent === 'pluto' ? PLUTO_BARYCENTRE : b.parent!;
        const want = evalMoon(moons[b.id], t);
        expect(dist(relEcl(b.id, centre), want), `${b.id}`).toBeLessThan(1e-6 * norm(want) + 1e-6);
      }
    }
    at(T0);
  });

  it('puts Pluto and Charon on either side of their barycentre, about 19,600 km apart', () => {
    const p = relEcl('pluto', PLUTO_BARYCENTRE);
    const c = relEcl('charon', PLUTO_BARYCENTRE);
    const cos = (p[0] * c[0] + p[1] * c[1] + p[2] * c[2]) / (norm(p) * norm(c));
    expect(cos).toBeLessThan(-0.99999);
    expect(norm(p)).toBeGreaterThan(2000);
    expect(norm(p)).toBeLessThan(2250);
    expect(dist(p, c)).toBeGreaterThan(19_400);
    expect(dist(p, c)).toBeLessThan(19_800);
    // Their centre of mass (with Nix and Hydra, which weigh almost nothing) is the barycentre.
    const gp = bodyRecord('pluto').physical.gmKm3S2!;
    const gc = bodyRecord('charon').physical.gmKm3S2!;
    const cm = [0, 1, 2].map((i) => (gp * p[i] + gc * c[i]) / (gp + gc));
    expect(norm(cm)).toBeLessThan(20);
  });

  it('flies Voyager 2 past Neptune at 29,236 km on 25 August 1989', () => {
    const ca = tracks.info('voyager2').pieces.find((p) => p.centre === 'neptune') as unknown as { closestApproach: { t: number; distanceKm: number } };
    const tt = ca.closestApproach.t;
    // The TDB time of closest approach as a UTC clock time (ΔT was 56.6 s in 1989).
    const ms = Date.UTC(2000, 0, 1, 12) + tt * 86_400_000 - 56_600;
    at(ms);
    expect(Math.abs(norm(relEcl('voyager2', 'neptune')) - ca.closestApproach.distanceKm)).toBeLessThan(2);
    expect(sim.bodies.voyager2.regime).toBe('precise');
    // Triton is nearby: the flyby passed about 40,000 km from it five hours later.
    at(ms + 5.2 * 3_600_000);
    expect(norm(relEcl('voyager2', 'triton'))).toBeLessThan(60_000);
    at(T0);
  });

  it('flies New Horizons past Pluto: 15,382 km from the barycentre, about 13,700 km from Pluto itself', () => {
    const ca = tracks.info('new-horizons').pieces.find((p) => p.centre === 'pluto') as unknown as { closestApproach: { t: number; distanceKm: number } };
    const ms = Date.UTC(2000, 0, 1, 12) + ca.closestApproach.t * 86_400_000 - 67_700; // ΔT ≈ 67.7 s in 2015
    at(ms);
    expect(Math.abs(norm(relEcl('new-horizons', PLUTO_BARYCENTRE)) - ca.closestApproach.distanceKm)).toBeLessThan(2);
    const toPluto = norm(relEcl('new-horizons', 'pluto'));
    expect(toPluto).toBeGreaterThan(13_000);
    expect(toPluto).toBeLessThan(14_500);
    at(T0);
  });

  it('keeps Webb near the Sun–Earth L2 point, about 1.5 million km from Earth', () => {
    const d = norm(relEcl('jwst', 'earth'));
    expect(d).toBeGreaterThan(0.9e6);
    expect(d).toBeLessThan(2e6);
    // Roughly away from the Sun: L2 is on the night side.
    const e = relEcl('earth', 'sun');
    const j = relEcl('jwst', 'earth');
    expect((e[0] * j[0] + e[1] * j[1] + e[2] * j[2]) / (norm(e) * norm(j))).toBeGreaterThan(0.7);
  });

  it('puts Halley at its 2061 perihelion, 0.59 au from the Sun', () => {
    at(msFromCivil(2061, 7, 28, 17, 16));
    const r = sim.bodies.halley.pos.length() / 149_597_870.7;
    expect(r).toBeGreaterThan(0.57);
    expect(r).toBeLessThan(0.6);
    at(T0);
  });
});

describe('where the data end', () => {
  it('hides spacecraft before launch, with the date in the reason', () => {
    const a = bodyAvailability('voyager2', msFromCivil(1977, 8, 1));
    expect(a.available).toBe(false);
    expect(a.reason).toMatch(/20 August 1977/);
    expect(bodyAvailability('voyager1', msFromCivil(1977, 9, 1)).available).toBe(false);
    expect(bodyAvailability('voyager1', msFromCivil(1979, 3, 5)).available).toBe(true);
  });

  it('hides Webb after its planned trajectory ends in 2031', () => {
    expect(bodyAvailability('jwst', msFromCivil(2031, 9, 22)).available).toBe(false);
    expect(bodyAvailability('jwst', msFromCivil(2031, 9, 22)).reason).toMatch(/21 September 2031/);
    expect(bodyAvailability('jwst', T0).regime).toBe('precise');
  });

  it('labels the regimes: extrapolated tracks, illustrative moons, precise inside', () => {
    expect(bodyAvailability('voyager1', msFromCivil(2150, 1, 1))).toMatchObject({ available: true, regime: 'extrapolated' });
    expect(bodyAvailability('sedna', msFromCivil(2300, 1, 1))).toMatchObject({ available: true, regime: 'extrapolated' });
    expect(bodyAvailability('titan', msFromCivil(1950, 1, 1))).toMatchObject({ available: true, regime: 'illustrative' });
    expect(bodyAvailability('titan', T0).regime).toBe('precise');
    expect(bodyAvailability('pluto', msFromCivil(2500, 1, 1)).regime).not.toBe('precise');
    expect(bodyAvailability('oumuamua', msFromCivil(1700, 1, 1)).regime).toBe('precise');
  });

  it('keeps Voyager 1 moving on its two-body extension after the data end', () => {
    const a = bodyPositionAt('voyager1', astroTimeAt(msFromCivil(2120, 1, 1)));
    const b = bodyPositionAt('voyager1', astroTimeAt(msFromCivil(2121, 1, 1)));
    // About 17 km/s: 3.6 au a year.
    expect(a.distanceTo(b) / 149_597_870.7).toBeGreaterThan(3.3);
    expect(a.distanceTo(b) / 149_597_870.7).toBeLessThan(3.9);
  });
});

describe('rotation', () => {
  const X = new Vector3(1, 0, 0);
  it('turns the synchronous moons’ prime meridians towards their planet', () => {
    const q = new Quaternion();
    for (const b of bodies.bodies) {
      if (b.kind !== 'moon' || b.rotation.model !== 'iau-2015' || !b.rotation.synchronous) continue;
      const s = sim.bodies[b.id];
      const planet = b.parent === 'pluto' ? sim.bodies.pluto : sim.bodies[b.parent!];
      q.copy(s.quat);
      const meridian = X.clone().applyQuaternion(q);
      const toPlanet = planet.pos.clone().sub(s.pos).normalize();
      const deg = (Math.acos(Math.min(1, meridian.dot(toPlanet))) * 180) / Math.PI;
      // The IAU prime meridians face the planet on average; eccentricity swings them by up to
      // about 2e radians, and the IAU models' own terms (their W₀ and libration phases, which
      // define the maps' longitudes) by a few degrees more: most for Mimas, whose 71-year
      // resonant libration the IAU model follows with a 44.85° term (up to 11° off Saturn in
      // 1981–2199 against the fitted orbit). Nereid is not synchronous; Hyperion tumbles.
      const e = moons[b.id].orbit.e;
      expect(deg, b.id).toBeLessThan((2 * e * 180) / Math.PI + (b.id === 'mimas' ? 12 : 6));
    }
  });

  it('keeps Pluto and Charon facing each other', () => {
    const p = sim.bodies.pluto;
    const c = sim.bodies.charon;
    const pm = X.clone().applyQuaternion(p.quat);
    const cm = X.clone().applyQuaternion(c.quat);
    const pc = c.pos.clone().sub(p.pos).normalize();
    expect(pm.dot(pc)).toBeGreaterThan(Math.cos((3 * Math.PI) / 180));
    expect(cm.dot(pc)).toBeLessThan(-Math.cos((3 * Math.PI) / 180));
  });
});

describe('what the records say', () => {
  const rec = (id: string) => getBody(id) as BodyRecord;

  it('gives every new body its facts, sources, discovery or mission, and a note on its position', () => {
    for (const b of bodies.bodies) {
      const r = rec(b.id);
      // The visitors from other stars have one more: where they came from, and how fast (interstellar.ts).
      const n = b.kind === 'interstellar' ? 4 : 3;
      expect(r.facts, b.id).toHaveLength(n);
      expect(r.factSources, b.id).toHaveLength(n);
      if (b.kind === 'spacecraft') expect(r.mission?.launch, b.id).toMatch(/^\d{4}-\d{2}-\d{2}/);
      else expect(r.discovery?.by, b.id).toBeTruthy();
      expect(r.positionNote, b.id).toMatch(/^Position: fitted to JPL Horizons/);
    }
    expect(rec('titan').positionNote).toBe('Position: fitted to JPL Horizons, within ~40 km in 1981–2199; outside those years its mean orbit (illustrative).');
    expect(rec('pluto').positionNote).toMatch(/barycentre/);
  });

  it('says where there is no surface map, and labels illustrative rotations and assumed ring planes', () => {
    expect(rec('eris').modelNotes?.some((n) => n.startsWith('No surface map exists'))).toBe(true);
    expect(rec('titan').modelNotes?.some((n) => n.startsWith('No surface map'))).toBe(false);
    expect(rec('hyperion').modelNotes?.some((n) => /Rotation illustrative/.test(n))).toBe(true);
    expect(rec('quaoar').modelNotes?.some((n) => /pole is not known/.test(n))).toBe(true);
    expect(rec('jupiter').modelNotes?.some((n) => /more opaque than they are/.test(n))).toBe(true);
  });

  it('draws maps with their channels and tints, shapes, rings and tails', () => {
    expect(rec('europa').visual).toMatchObject({ map: 'textures/europa.jpg', mapChannels: 1, mapTint: bodies.bodies.find((b) => b.id === 'europa')!.colourHue });
    expect(rec('io').visual?.mapTint).toBeUndefined();
    expect(rec('churyumov-gerasimenko').visual?.shape).toBe('models/churyumov-gerasimenko.bin');
    for (const id of ['jupiter', 'uranus', 'neptune', 'haumea', 'quaoar']) expect(rec(id).visual?.rings?.kind, id).toBe('bands');
    const nep = rec('neptune').visual!.rings!;
    expect(nep.kind === 'bands' && nep.arcs?.spans.length).toBe(5);
    expect(rec('halley').visual?.tails).toBe(true);
    expect(rec('oumuamua').visual?.tails).toBeFalsy();
    expect(rec('jwst').visual?.craft).toBe('jwst');
    // Uranus's epsilon ring keeps its real opacity (τ 1.4).
    const ura = rec('uranus').visual!.rings!;
    const eps = ura.kind === 'bands' ? ura.bands.find((b) => b.innerKm > 51_000 && b.outerKm < 51_200) : undefined;
    expect(eps?.opacity).toBeCloseTo(1 - Math.exp(-1.4), 6);
  });

  it('rounds accuracy figures to two significant figures', () => {
    expect(twoFigures(39.68)).toBe('40');
    expect(twoFigures(1482)).toBe('1,500');
    expect(twoFigures(0.6)).toBe('0.6');
    expect(twoFigures(2.14)).toBe('2.1');
  });
});

describe('in the rest of the app', () => {
  it('is found by names and nicknames', () => {
    const top = (q: string) => searchDestinations(q)[0]?.destination.id;
    expect(top('67P')).toBe('churyumov-gerasimenko');
    expect(top('Comet Halley')).toBe('halley');
    expect(top('Halley')).toBe('halley');
    expect(top("'Oumuamua")).toBe('oumuamua');
    expect(top('Oumuamua')).toBe('oumuamua');
    expect(top('Titan')).toBe('titan');
    expect(top('Saturn VI')).toBe('titan');
    expect(top('Webb')).toBe('jwst');
    expect(top('Ultima Thule')).toBe('arrokoth');
  });

  it('lists moons under their planet, and the small bodies, comets, visitors and craft by kind', () => {
    const groups = nestedDestinations();
    const planets = groups.find((g) => g.id === 'sun-planets')!.items;
    const saturn = planets.find((i) => i.destination.id === 'saturn')!;
    expect(saturn.children).toBe(8);
    expect(planets.find((i) => i.destination.id === 'titan')?.depth).toBe(1);
    const dwarfs = groups.find((g) => g.id === 'dwarf-planets')!.items.map((i) => i.destination.id);
    expect(dwarfs).toEqual(expect.arrayContaining(['ceres', 'pluto', 'charon', 'eris', 'haumea', 'makemake', 'sedna']));
    expect(groups.find((g) => g.id === 'comets')!.items.map((i) => i.destination.id)).toEqual(['halley', 'encke', 'churyumov-gerasimenko', 'hale-bopp']);
    expect(groups.find((g) => g.id === 'interstellar')!.items.map((i) => i.destination.id)).toEqual(['oumuamua', 'borisov', 'atlas-3i']);
    expect(groups.find((g) => g.id === 'spacecraft')!.items.map((i) => i.destination.id)).toEqual(
      expect.arrayContaining(['voyager1', 'voyager2', 'new-horizons', 'pioneer10', 'parker-solar-probe', 'jwst']),
    );
    expect(groups.find((g) => g.id === 'small-bodies')!.items.map((i) => i.destination.id)).toEqual(['vesta', 'arrokoth']);
    expect(findDestination('gonggong')?.kind).toBe('Dwarf planet candidate');
  });

  it('has trails, systems and articles', () => {
    expect(locationPath('orbit', 'titan').map((c) => c.label)).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Milky Way', 'Orion Arm', 'Solar neighbourhood', 'Solar System', 'Saturn', 'Titan']);
    expect(locationPath('orbit', 'nix').map((c) => c.label)).toEqual(['Observable universe', 'Local Universe', 'Local Group', 'Milky Way', 'Orion Arm', 'Solar neighbourhood', 'Solar System', 'Pluto', 'Nix']);
    expect(systemOf('titan')?.id).toBe('saturn');
    expect(articleForBody('titan')).toBe('worlds-around-worlds');
    expect(articleForBody('charon')).toBe('edges-of-the-solar-system');
    expect(articleForBody('arrokoth')).toBe('edges-of-the-solar-system');
    expect(articleForBody('oumuamua')).toBe('edges-of-the-solar-system');
    expect(articleForBody('voyager2')).toBe('edges-of-the-solar-system');
    expect(articleForBody('new-horizons')).toBe('edges-of-the-solar-system');
    expect(articleForBody('halley')).toBe('clockwork-and-chaos');
    expect(articleForBody('parker-solar-probe')).toBe('rockets-to-the-stars');
    expect(articleForBody('jwst')).toBe('other-worlds');
  });
});

// ─── Cost ────────────────────────────────────────────────────────────────────────────────

interface V8 {
  setFlagsFromString(flags: string): void;
  getHeapSpaceStatistics(): { space_name: string; space_used_size: number }[];
}
const node = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process;
const v8 = node.getBuiltinModule('node:v8') as V8;
const vm = node.getBuiltinModule('node:vm') as { runInNewContext(code: string): unknown };
v8.setFlagsFromString('--expose-gc');
const gc = vm.runInNewContext('gc') as () => void;
const newSpace = () => v8.getHeapSpaceStatistics().find((s) => s.space_name === 'new_space')!.space_used_size;

/** Young-generation bytes a function allocates per call: the least of several uninterrupted tries. */
function bytesPerCall(fn: (i: number) => void, calls = 2000): number {
  for (let i = 0; i < 20_000; i++) fn(i);
  let best = Infinity;
  for (let k = 0; k < 6; k++) {
    gc();
    const before = newSpace();
    for (let i = 0; i < calls; i++) fn(i);
    const used = newSpace() - before;
    if (used >= 0) best = Math.min(best, used / calls);
  }
  return best;
}

/**
 * A few boxed numbers per call remain (V8 boxes a float64 handed to a function it did not
 * inline: 16 bytes each), but no arrays or objects: the staging evaluator allocated 300 bytes or
 * more per call. At 50 bodies a frame this is a few kB a frame, against the 170 kB the built-in
 * bodies' astronomy-engine calls allocate.
 */
const FEW_NUMBERS = 256;

describe('per-frame cost', () => {
  it('evaluates the moon models and the tracks without allocating arrays or objects', () => {
    const pos = { x: 0, y: 0, z: 0 };
    const vel = { x: 0, y: 0, z: 0 };
    const titan = fittedMoonProvider(moons.titan);
    const times = Array.from({ length: 64 }, (_, i) => astroTimeAt(T0 + i * 1000));
    expect(bytesPerCall((i) => titan.positionAt(times[i & 63], pos, vel))).toBeLessThan(FEW_NUMBERS);
    const t = sim.astroTime.tt;
    const ids = tracks.bodies;
    expect(bytesPerCall((i) => tracks.sample(ids[i % ids.length], t + (i & 63) * 0.01, true))).toBeLessThan(FEW_NUMBERS);
    // Extrapolated: the conics too.
    expect(bytesPerCall((i) => tracks.sample(ids[i % ids.length], 1e6 + i, true))).toBeLessThan(FEW_NUMBERS);
    // Availability, asked for every body every frame.
    const all = bodies.bodies.map((b) => entryOf(b.id)!.record.provider);
    expect(bytesPerCall((i) => all[i % all.length].availability(T0))).toBeLessThan(FEW_NUMBERS / 4);
  });
});

describe('what the card and the data sheet say is a model', () => {
  it('gives every built-in body a position note, and the maps that are illustrative a note of their own', () => {
    for (const id of ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto', 'voyager1']) {
      expect(getBody(id)!.positionNote, id).toMatch(/^Position: /);
    }
    expect(getBody('mars')!.positionNote).toMatch(/1700–2200.*3000 BCE–3000 CE.*illustrative/);
    for (const id of ['sun', 'venus', 'earth', 'uranus', 'neptune', 'pluto']) expect(getBody(id)!.modelNotes?.length, id).toBeGreaterThan(0);
    expect(getBody('pluto')!.modelNotes).toEqual(expect.arrayContaining([expect.stringMatching(/southern latitudes .* filled in/)]));
  });

  it('credits each moon’s rotation to its own model, not the IAU’s for all', () => {
    expect(getBody('titan')!.dataSource).toMatch(/rotation: IAU WGCCRE 2015/);
    for (const id of ['hyperion', 'nereid', 'nix', 'hydra']) expect(getBody(id)!.dataSource, id).not.toMatch(/IAU/);
    expect(getBody('hyperion')!.dataSource).toMatch(/illustrative tumble/);
    expect(getBody('nereid')!.dataSource).toMatch(/period only \(Kiss et al\. 2016\)/);
    expect(getBody('nix')!.dataSource).toMatch(/Weaver et al\. 2016/);
  });

  it('prints each radius to the precision it has', () => {
    const r = (id: string) => radiusReading(getBody(id)!);
    expect(r('atlas-3i')).toMatchObject({ l: 'Radius (rough)', v: '≈ 1.5' });
    expect(r('oumuamua').v).toBe('≈ 0.07');
    expect(r('sedna').v).toBe('500 ± 40');
    expect(r('titan').v).toBe('2574.76 ± 0.02');
    expect(r('ceres').v).toBe('469.7 ± 0.1');
    expect(r('arrokoth').v).toBe('9.947');
    expect(r('voyager2')).toMatchObject({ l: 'Size (half its length)', u: 'm' });
  });
});
