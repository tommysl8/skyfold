/**
 * Every "See it in Skyfold" button in the Learn articles works: each see-it block, read by
 * the app's own renderer, names a scene that resolves in the registry once the data have loaded
 * (read from disk here, as the loaders would register them) and can run from Earth today. Every
 * target the articles may name resolves, every named scene is built, and every body's "Read"
 * button opens an article that exists.
 */
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { msFromCivil } from '../lib/time';
import { setSimTime } from '../sim/sim';
import { updateEphemeris } from '../sim/ephemeris';
import { bodyRecords } from '../sim/bodies';
import { registerUniverse } from '../test/universe';
import { renderArticle } from './learn/markdown';
import { articleForBody } from './bodyArticles';
import { useUI } from '../state/ui';
import { stopTrip } from '../ui/tripActions';
import { cancelSceneStep, flightOf, KNOWN_TARGETS, LATER, NAMED_SCENES, parseScene, predictFlight, resolveTarget, runScene, sceneNote, sceneStatus } from './scenes';
import { adoptSet, buildSet } from '../sim/deepsky/runtime';
import { DEEP_SKY_FILES, MAGNETARS_FILE, type ColumnFile } from '../sim/deepsky/format';
import { gunzipFile } from '../test/stars';

const SOURCES = import.meta.glob<string>('./learn/articles/*.md', { query: '?raw', import: 'default', eager: true });

const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

const RENDERED = Object.entries(SOURCES).map(([path, source]) => ({ file: path.replace(/^.*\//, ''), ...renderArticle(source) }));

/** Every see-it spec, with the article it is in, as the Learn reader finds them. */
const SPECS: { file: string; spec: string }[] = RENDERED.flatMap(({ file, html }) => [...html.matchAll(/data-scene="([^"]*)"/g)].map((m) => ({ file, spec: unescape(m[1]) })));

beforeAll(() => {
  registerUniverse();
  // The pulsar catalogue, as its loader takes it in (its best-known pulsars and the magnetars become bodies): the
  // field scenes of the Crab, SGR 1806−20 and the Double Pulsar need it.
  const file = (path: string): ColumnFile => JSON.parse(new TextDecoder().decode(gunzipFile(`public/${path}`))) as ColumnFile;
  adoptSet(buildSet('pulsars', file(DEEP_SKY_FILES.pulsars), file(MAGNETARS_FILE)));
  // A fixed date, so the flights' reachability does not depend on when the tests run.
  setSimTime(msFromCivil(2026, 9, 26, 12));
  updateEphemeris();
});

describe('the Learn articles’ see-it blocks', () => {
  it('are all found', () => {
    expect(RENDERED.length).toBeGreaterThanOrEqual(17);
    expect(SPECS.length).toBeGreaterThan(90);
    // Each named scene the articles use, at least once (the black holes' in Black holes).
    for (const name of ['race-sunlight', 'year-in-30s', 'moon-month', 'split-0.999c', 'light-time-correction', 'mars-opposition', 'jupiter-moons', 'galactic-centre-orbits', 'milky-way-outside', 'local-group', 'cosmic-web', 'cmb-map', 'cmb-glow', 'edge-of-reach',
      'sgr-a-star-shadow', 'photon-ring', 'sgr-a-star-einstein-ring', 'hover-at-the-horizon', 'isco-orbit', 'fall-into-sgr-a-star', 'dive-and-climb', 'sgr-a-star-flyby', 's2-behind-sgr-a-star', 'sgr-a-star-flow', 'm87-star-close', 'galactic-field'])
      expect(SPECS.some((s) => s.spec === name), name).toBe(true);
  });

  it('each name a scene Skyfold knows', () => {
    for (const { file, spec } of SPECS) expect(parseScene(spec), `${file}: ${spec}`).not.toBeNull();
  });

  it('each resolve and can run now', () => {
    const failing = SPECS.map(({ file, spec }) => ({ file, spec, status: sceneStatus(spec) })).filter((s) => !s.status.ok);
    expect(failing.map((f) => `${f.file}: ${f.spec}: ${f.status.reason}`)).toEqual([]);
  });

  it('say what to look for in every named scene and flight', () => {
    for (const { file, spec } of SPECS) {
      const s = parseScene(spec)!;
      if (s.kind === 'named' || s.kind === 'fly') expect(sceneNote(spec)?.length ?? 0, `${file}: ${spec}`).toBeGreaterThan(40);
    }
  });

  it('give the flights beyond the Local Group through the expanding universe, and say what they assume', () => {
    const virgo = predictFlight(flightOf('fly:virgo-cluster')!)!;
    expect(virgo.model).toBe('flrw');
    expect(sceneNote('fly:virgo-cluster')).toMatch(/^A rocket pushing at one Earth gravity, turning round a little after halfway to arrive at the Virgo Cluster at rest: about 35 years on board and 54 million years at home\. The universe expands on the way: the flight is a model, with a perfect engine and galaxies carried along by the expansion\./);
    // Andromeda is inside the Local Group, where space is static.
    expect(predictFlight(flightOf('fly:andromeda')!)!.model).toBe('static');
    // All the way in (a galaxy has no surface to stop short of): the numbers of the trip to Andromeda itself.
    expect(sceneNote('fly:andromeda')).toMatch(/^A rocket pushing at one Earth gravity, turning round halfway to arrive at the Andromeda Galaxy at rest: about 29 years on board and 2\.5 million years at home\. Watch/);
  });
});

describe('every target and named scene', () => {
  it('resolves every target the articles may name', () => {
    expect(KNOWN_TARGETS.filter((t) => resolveTarget(t) === null)).toEqual([]);
    const blocked = KNOWN_TARGETS.map((t) => [t, sceneStatus(`go:${t}`)] as const).filter(([, s]) => !s.ok);
    expect(blocked.map(([t, s]) => `${t}: ${s.reason}`)).toEqual([]);
  });

  it('builds every named scene: none is missing', () => {
    expect(NAMED_SCENES.filter((n) => sceneStatus(n).reason === LATER)).toEqual([]);
  });

  it('runs every named scene, and each turns back the views the last one turned on', () => {
    // The flights hand the camera to the ship, which leaves pointer lock (there is no page here).
    if (typeof document === 'undefined') vi.stubGlobal('document', { pointerLockElement: null, exitPointerLock: () => {} });
    try {
      useUI.setState({ showCmb: false, retarded: false, relMode: 'on', relDoppler: false, lensing: true, accretionFlow: true, accretionBand: 'visible', fieldLines: false, showOrbits: true });
      for (const name of NAMED_SCENES) {
        expect(runScene(name), name).toBe(true);
        cancelSceneStep();
        if (useUI.getState().tripActive) stopTrip();
        useUI.setState({ plannerOpen: false });
        setSimTime(msFromCivil(2026, 9, 26, 12));
        updateEphemeris();
      }
      // The last scene's views go when the next scene starts.
      expect(runScene('cmb-map')).toBe(true);
      expect(useUI.getState().showCmb).toBe(true);
      expect(runScene('go:jupiter')).toBe(true);
      // The black-hole scenes' lens and flow switches too (a lens scene turns the flow off; the next puts it back), and
      // the magnetic field's lines and the orbits its sky scene hides.
      expect(useUI.getState()).toMatchObject({ showCmb: false, retarded: false, relMode: 'on', relDoppler: false, lensing: true, accretionFlow: true, accretionBand: 'visible', fieldLines: false, showOrbits: true });
      expect(runScene('galactic-field-sky')).toBe(true);
      expect(useUI.getState()).toMatchObject({ fieldLines: true, showOrbits: false });
      expect(runScene('go:jupiter')).toBe(true);
      expect(useUI.getState()).toMatchObject({ fieldLines: false, showOrbits: true });
    } finally {
      cancelSceneStep();
      vi.unstubAllGlobals();
    }
  });

  it('says why a flight beyond the cosmic event horizon cannot be made', () => {
    expect(sceneStatus('fly:gn-z11')).toEqual({ ok: false, reason: 'GN-z11 cannot be reached from Earth: beyond the cosmic event horizon', label: 'Fly to GN-z11 at 1 g' });
  });
});

describe('the Read buttons of the bodies', () => {
  it('open articles that exist', () => {
    const slugs = new Set(RENDERED.map((r) => r.data.slug));
    expect(slugs.size).toBe(RENDERED.length);
    const broken = bodyRecords()
      .map((r) => [r.id, articleForBody(r.id)] as const)
      .filter(([, slug]) => slug !== undefined && !slugs.has(slug));
    expect(broken).toEqual([]);
  });
});
