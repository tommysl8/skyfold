import { beforeAll, describe, expect, it } from 'vitest';
import { msFromCivil } from '../lib/time';
import { setSimTime } from '../sim/sim';
import { updateEphemeris } from '../sim/ephemeris';
import { useUI } from '../state/ui';
import { controller } from '../controls/cameraController';
import {
  addTargetResolver,
  afterSlew,
  cancelSceneStep,
  defineScene,
  flightOf,
  KNOWN_TARGETS,
  LATER,
  NAMED_SCENES,
  parseScene,
  resolveTarget,
  runScene,
  sceneNote,
  sceneStatus,
  specOf,
  theName,
} from './scenes';
import { starData } from '../sim/stars/load';
import { cosmosState } from '../sim/cosmos/load';
import { JOURNEYS } from './journeys';
import { registerSolarSystem, type BodiesFile, type RingsFile } from '../sim/solarSystem';
import { indexMoonCatalog, type MoonCatalog } from '../sim/moonModels';
import { parseTracks, type TracksIndex } from '../sim/tracks';
import { readBytes, readJson } from '../test/files';

beforeAll(() => {
  // A fixed date, so the flights' reachability does not depend on when the tests run.
  setSimTime(msFromCivil(2026, 9, 25, 12));
  updateEphemeris();
});

describe('parseScene', () => {
  it('reads go, fly (1 g or constant speed), sky-from and date', () => {
    expect(parseScene('go:jupiter')).toEqual({ kind: 'go', target: 'jupiter' });
    expect(parseScene('fly:proxima')).toEqual({ kind: 'fly', target: 'proxima', beta: null });
    expect(parseScene('fly:saturn?beta=0.9')).toEqual({ kind: 'fly', target: 'saturn', beta: 0.9 });
    expect(parseScene('fly:barnards-star?beta=.12')).toEqual({ kind: 'fly', target: 'barnards-star', beta: 0.12 });
    expect(parseScene('sky-from:pluto')).toEqual({ kind: 'sky-from', target: 'pluto' });
    expect(parseScene(' date:2117-12-11 ')).toEqual({ kind: 'date', date: '2117-12-11', ms: msFromCivil(2117, 12, 11) });
  });

  it('reads every named scene', () => {
    for (const name of NAMED_SCENES) expect(parseScene(name)).toEqual({ kind: 'named', name });
  });

  it('accepts every target the articles use, even those not in the app yet', () => {
    for (const t of KNOWN_TARGETS) expect(parseScene(`go:${t}`)).not.toBeNull();
    expect(KNOWN_TARGETS).toContain('jades-gs-z14-0');
    expect(KNOWN_TARGETS).toContain('mom-z14');
    expect(KNOWN_TARGETS).toHaveLength(116);
    expect(KNOWN_TARGETS).toEqual(expect.arrayContaining(['m87-star', 'gaia-bh1', 'gaia-bh2', 'gaia-bh3', 'cyg-x-1', 'ogle-2011-blg-0462']));
    expect(KNOWN_TARGETS).toEqual(expect.arrayContaining(['trappist-1', 'hr-8799', '51-pegasi', 'kepler-90', 'toi-700', 'kepler-16']));
  });

  it('rejects anything else', () => {
    for (const spec of [
      '',
      'go:',
      'go:atlantis',
      'goto:mars',
      'fly:mars?beta=1',
      'fly:mars?beta=0',
      'fly:mars?beta=1.5',
      'fly:mars?beta=-0.5',
      'fly:mars?speed=0.5',
      'go:mars?beta=0.5',
      'date:2026-02-30',
      'date:26-01-01',
      'date:2026-13-01',
      'race-sunlight-2',
      'go:Mars',
    ])
      expect(parseScene(spec), spec).toBeNull();
  });

  it('writes a scene back as its canonical spec', () => {
    for (const spec of ['go:mars', 'fly:proxima', 'fly:saturn?beta=0.9', 'sky-from:sun', 'date:2027-02-19', 'moon-month'])
      expect(specOf(parseScene(spec)!)).toBe(spec);
  });
});

describe('sceneStatus', () => {
  it('is ok for what exists today, with a label', () => {
    expect(sceneStatus('go:jupiter')).toEqual({ ok: true, label: 'Go to Jupiter' });
    expect(sceneStatus('fly:proxima')).toEqual({ ok: true, label: 'Fly to Proxima Centauri at 1 g' });
    expect(sceneStatus('fly:saturn?beta=0.9')).toEqual({ ok: true, label: 'Fly to Saturn at 0.9c' });
    expect(sceneStatus('sky-from:pluto')).toEqual({ ok: true, label: 'The sky from Pluto' });
    expect(sceneStatus('date:2117-12-11')).toEqual({ ok: true, label: 'Go to 11 December 2117' });
    for (const name of ['race-sunlight', 'year-in-30s', 'moon-month', 'split-0.999c', 'light-time-correction', 'mars-opposition', 'jupiter-moons'])
      expect(sceneStatus(name).ok, name).toBe(true);
  });

  it('says what is still loading, what did not load, and what is not in the app at all', () => {
    // The stars and the galaxies (sim/stars, sim/cosmos) are not loaded in this test: their loaders were never asked.
    expect(sceneStatus('fly:barnards-star?beta=0.12')).toEqual({ ok: false, reason: LATER, label: 'Fly to Barnard’s Star at 0.12c' });
    expect(LATER).not.toMatch(/later update/);
    const stars = starData.status;
    const galaxies = cosmosState.status;
    try {
      starData.status = 'loading';
      cosmosState.status = 'loading';
      expect(sceneStatus('fly:barnards-star?beta=0.12').reason).toBe('Loading the star catalogue…');
      expect(sceneStatus('go:andromeda')).toEqual({ ok: false, reason: 'Loading the galaxies…', label: 'Go to the Andromeda Galaxy' });
      expect(sceneStatus('cosmic-web')).toEqual({ ok: false, reason: 'Loading the galaxies…', label: 'The cosmic web' });
      starData.status = 'failed';
      cosmosState.status = 'failed';
      expect(sceneStatus('go:sirius').reason).toBe('The star catalogue did not load: reload the page to try again');
      expect(sceneStatus('local-group').reason).toBe('The galaxies did not load: reload the page to try again');
    } finally {
      starData.status = stars;
      cosmosState.status = galaxies;
    }
  });

  it('explains specs that are not scenes and flights that go nowhere', () => {
    expect(sceneStatus('go:atlantis')).toEqual({ ok: false, reason: 'Not a scene Skyfold knows', label: 'go:atlantis' });
    expect(sceneStatus('fly:earth')).toMatchObject({ ok: false, reason: 'Flights leave from Earth' });
  });

  it('says why not while a flight is under way', () => {
    useUI.setState({ tripActive: true });
    try {
      expect(sceneStatus('go:mars')).toMatchObject({ ok: false, reason: expect.stringMatching(/flight is under way/) });
      expect(sceneStatus('race-sunlight').ok).toBe(false);
      // Not in the app (or not loaded yet) is the answer whatever is happening.
      expect(sceneStatus('go:andromeda').reason).toBe(LATER);
    } finally {
      useUI.setState({ tripActive: false });
    }
  });

  it('can be extended by later updates: a resolver for new targets, a definition for new scenes', () => {
    expect(resolveTarget('andromeda')).toBeNull();
    const remove = addTargetResolver((id) => (id === 'andromeda' ? { kind: 'body', id: 'proxima', name: 'Andromeda Galaxy' } : null));
    expect(sceneStatus('go:andromeda')).toEqual({ ok: true, label: 'Go to the Andromeda Galaxy' });
    remove();
    expect(sceneStatus('go:andromeda').ok).toBe(false);

    defineScene('cosmic-web', { label: 'The cosmic web', note: 'Filaments of galaxies.', run: () => true });
    expect(sceneStatus('cosmic-web')).toEqual({ ok: true, label: 'The cosmic web' });
    expect(sceneNote('cosmic-web')).toBe('Filaments of galaxies.');
  });
});

describe('notes and flights', () => {
  it('describe a constant-speed flight with its clock rate', () => {
    expect(sceneNote('fly:mars?beta=0.5')).toBe(
      'A steady 0.5c from Earth to Mars. Your clock, τ, runs at 87% of the rate of Earth’s, t. The stars gather ahead of you and turn blue; drag to look around.',
    );
    expect(sceneNote('fly:mars?beta=0.999')).toMatch(/at 4\.5% of the rate/);
    expect(sceneNote('fly:mars?beta=0.001')).toMatch(/at almost exactly the rate of Earth’s, t\.$/);
    expect(sceneNote('go:mars')).toBeNull();
    expect(sceneNote('date:2061-07-28')).toBe('The date is now 28 July 2061. Press N to come back to today.');
  });

  it('give a 1 g flight’s two clocks as the planner has them', () => {
    // Neptune is 29 au out: 2√(d/g) = 15 days at 1 g, hardly less on board (the peak speed is 0.02c).
    expect(sceneNote('fly:neptune')).toMatch(/^A rocket pushing at one Earth gravity, turning round halfway to arrive at Neptune at rest: about 15 days on board and 15 days at home\. Watch your clock/);
    expect(sceneNote('fly:sun')).toMatch(/arrive at the Sun at rest/);
  });

  it('put "the" before the names that take it', () => {
    expect(['Sun', 'Moon', 'Andromeda Galaxy', 'Virgo Cluster', 'Orion Nebula', 'Large Magellanic Cloud', 'Local Group', 'Pleiades', 'James Webb Space Telescope'].map(theName)).toEqual([
      'the Sun',
      'the Moon',
      'the Andromeda Galaxy',
      'the Virgo Cluster',
      'the Orion Nebula',
      'the Large Magellanic Cloud',
      'the Local Group',
      'the Pleiades',
      'the James Webb Space Telescope',
    ]);
    for (const n of ['Mars', 'Proxima Centauri', 'Bode’s Galaxy (M81)', 'Sagittarius A*', 'M87', 'Omega Centauri', 'Halley’s Comet', 'GN-z11']) expect(theName(n)).toBe(n);
    expect(sceneStatus('go:sun').label).toBe('Go to the Sun');
    expect(sceneNote('sky-from:sun')).toBe('Beyond the Sun, looking back towards Earth. Drag to look around.');
  });

  it('give the flight a spec makes', () => {
    expect(flightOf('fly:proxima')).toEqual({ dest: 'proxima', drive: 'rocket', beta: 0 });
    expect(flightOf('fly:saturn?beta=0.9')).toEqual({ dest: 'saturn', drive: 'cruise', beta: 0.9 });
    expect(flightOf('split-0.999c')).toEqual({ dest: 'neptune', drive: 'cruise', beta: 0.999, split: true });
    expect(flightOf('race-sunlight')).toBeNull();
    expect(flightOf('go:mars')).toBeNull();
  });
});

describe('journeys', () => {
  it('wait for the Solar System data when they need it', () => {
    // The loader was never asked here; in the app it starts with the page ("Loading the Solar System data…").
    expect(sceneStatus('voyager2-neptune')).toMatchObject({ ok: false, reason: LATER, label: 'Ride Voyager 2 past Neptune' });
    expect(sceneStatus('halley-2061').ok).toBe(false);
  });

  it('are scene specs that run today, with what to look for', () => {
    registerSolarSystem({
      bodies: readJson<BodiesFile>('public/data/bodies.json'),
      rings: readJson<RingsFile>('public/data/rings.json'),
      moons: indexMoonCatalog(readJson<MoonCatalog>('public/data/moons.json')),
      tracks: parseTracks(readJson<TracksIndex>('public/data/tracks.json'), readBytes('public/data/tracks.bin')),
    });
    updateEphemeris();
    expect(JOURNEYS.map((j) => j.id)).toEqual(['sunlight', 'saturn', 'split', 'voyager', 'proxima', 'trappist', 'year', 'moon', 'neptune', 'halley', 'black-hole', 'cyg-x-1-disk', 'sgr-a-star-radio', 'monsters']);
    for (const j of JOURNEYS) {
      expect(parseScene(j.scene), j.id).not.toBeNull();
      expect(j.look.length, j.id).toBeGreaterThan(40);
      // TRAPPIST-1 needs the stars and the planetary systems (sim/exoplanets/exoplanets.test.ts runs it); the fall
      // into Sgr A* and its radio light need the Milky Way, Cygnus X-1's disc the stars (blackHoleScenes.test.ts runs them);
      // the extreme stars' tour needs the stars (articleScenes.test.ts runs it from the Learn article).
      if (['trappist', 'black-hole', 'cyg-x-1-disk', 'sgr-a-star-radio', 'monsters'].includes(j.id)) expect(sceneStatus(j.scene).reason).toBe(LATER);
      else expect(sceneStatus(j.scene).ok, j.id).toBe(true);
    }
  });

  it('keep their flights and notes', () => {
    const byId = Object.fromEntries(JOURNEYS.map((j) => [j.id, j]));
    expect(byId.saturn.flight).toEqual({ dest: 'saturn', drive: 'cruise', beta: 0.9 });
    expect(byId.voyager.flight).toEqual({ dest: 'voyager1', drive: 'cruise', beta: 0.99 });
    expect(byId.proxima.flight).toEqual({ dest: 'proxima', drive: 'rocket', beta: 0 });
    expect(byId.split.flight).toEqual({ dest: 'neptune', drive: 'cruise', beta: 0.999, split: true });
    expect(byId.sunlight.flight).toBeUndefined();
    expect(byId.sunlight.clock).toBe('1 s here = 100 s');
    expect(byId.proxima.look).toMatch(/^A steady push of one Earth gravity takes you to the nearest star in 3\.5 years/);
    expect(byId.moon.look).toMatch(/^A month passes in 25 seconds\./);
  });
});

describe('views a scene turns on for itself', () => {
  it('are turned back by the next scene', () => {
    useUI.setState({ retarded: false, showCmb: false });
    expect(runScene('light-time-correction')).toBe(true);
    expect(useUI.getState().retarded).toBe(true);
    expect(runScene('go:jupiter')).toBe(true);
    expect(useUI.getState().retarded).toBe(false);
    cancelSceneStep();
  });

  it('stay as the visitor left them', () => {
    // Turned on by the visitor, not by a scene: kept.
    useUI.setState({ showCmb: true });
    expect(runScene('go:mars')).toBe(true);
    expect(useUI.getState().showCmb).toBe(true);
    // Turned off by the visitor after the scene turned it on: not turned back on.
    useUI.setState({ showCmb: false, retarded: false });
    expect(runScene('light-time-correction')).toBe(true);
    useUI.setState({ retarded: false });
    useUI.setState({ showCmb: true });
    expect(runScene('go:mars')).toBe(true);
    expect(useUI.getState()).toMatchObject({ retarded: false, showCmb: true });
    useUI.setState({ showCmb: false });
    cancelSceneStep();
  });
});

describe('a scene step waiting for its slew', () => {
  const slew = (focus: 'sun' | 'mars') => {
    controller.moves++;
    useUI.setState({ controlMode: 'transition', focus });
  };
  const arrive = () => useUI.setState({ controlMode: 'orbit' });

  it('runs when the scene’s own slew ends', () => {
    let n = 0;
    slew('sun');
    afterSlew('sun', () => n++);
    expect(n).toBe(0);
    arrive();
    expect(n).toBe(1);
    arrive();
    expect(n).toBe(1);
  });

  it('is dropped when the camera is sent elsewhere first, even back to the same body', () => {
    let n = 0;
    slew('sun');
    afterSlew('sun', () => n++);
    slew('mars');
    arrive();
    slew('sun');
    afterSlew('sun', () => n++);
    slew('sun'); // the visitor picks the Sun again mid-slew
    arrive();
    expect(n).toBe(0);
  });

  it('waits once only, so running a scene twice does not do its step twice', () => {
    let n = 0;
    slew('sun');
    afterSlew('sun', () => n++);
    afterSlew('sun', () => n++);
    arrive();
    expect(n).toBe(1);
    slew('sun');
    afterSlew('sun', () => n++);
    cancelSceneStep();
    arrive();
    expect(n).toBe(1);
  });
});
