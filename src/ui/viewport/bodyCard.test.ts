/**
 * The body card's lines, and a black hole's: its height above the horizon, what it looks like from here, its mass
 * with the published uncertainties, at most three notes with the rest on the data sheet (docs/data/blackholes.md §3),
 * the Event Horizon Telescope's picture with its credit and licence; the View menu's switches, never saved; and
 * the physics notes near a hole, whose numbers are checked here against physics/schwarzschild.ts.
 */
import { describe, expect, it } from 'vitest';
import katex from 'katex';
import { createElement, Fragment } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fixedOffsetProvider, type BodyRecord } from '../../sim/bodies';
import { cardFact, cardModelLine, GALAXY_MODEL_LINE, originLine, sourceLinks, statusLine } from './BodyCard';
import { NO_IMAGE_NOTE } from '../../sim/exoplanets/records';
import { MILKY_WAY_MODEL_LABEL } from '../../sim/galaxy/records';
import { edgeAngle, einsteinAngle, shadowAngle, raindropDarkRadius } from '../../physics/schwarzschild';
import { hoverAccelKmS2 } from '../../physics/geodesics';
import { C_KM_S, G0_KM_S2, GM_SUN_KM3_S2, PARSEC_KM, AU_KM } from '../../physics/constants';
import { BLACK_HOLES, binaryHoleRecords, catalogueGalaxyHoleRecord, galaxyHoleRecord, holeJson, isolatedHoleRecord, m87StarRecord } from '../../sim/blackholes/records';
import { FLOW_TEXTS } from '../../sim/blackholes/accretion';
import { NSC_LAYER_CARD } from '../../sim/galaxy/nuclearCluster';
import { milkyWayRecord, sgrAFrom, sgrARecord } from '../../sim/galaxy/records';
import { SSTARS } from '../../sim/galaxy/load';
import { savedPrefs, useUI } from '../../state/ui';
import { EXPLAINERS, sectionNo } from '../../content/explainers';
import { REFERENCE } from '../../content/reference';
import { EXPLAINER_ARTICLES } from '../explainerActions';
import { headingSlug } from '../../content/learn/catalogue';
import { KEY_GROUPS } from '../keys';
import { fileExists, readText, REPO_ROOT } from '../../test/files';
import {
  deepSkyDistanceLine,
  deepSkyDistanceSource,
  deepSkyDistanceWords,
  ehtCaption,
  heightParts,
  heightText,
  holeFromHere,
  holeHeightLine,
  holeMassText,
  LENSING_HINT,
  rsText,
  skyAngleText,
  thrustText,
  type HoleViewLike,
} from '../deepSkyText';
import { cardNoteOnSheet, holeSpinLine, LENS_SHEET_NOTE, NSC_SHEET_NOTE, radiusReading, sentence, sheetNotes } from '../dataSheet';
import { FLOW_LAYER_CARD } from './LayerCards';
import { EHT_SHIPPED } from './EhtFigure';

const base: BodyRecord = { id: 'x', name: 'X', kind: 'moon', parent: 'saturn', physical: { radiusKm: 1, colour: '#888888' }, provider: fixedOffsetProvider(0, 0, 0) };
const DEG = Math.PI / 180;

describe('the body card’s lines', () => {
  it('says who found a body, when and where', () => {
    const titan = { ...base, discovery: { by: 'Christiaan Huygens', date: '1655-03-25', place: 'The Hague' } };
    expect(originLine(titan)).toBe('Discovered on 25 March 1655 by Christiaan Huygens (The Hague).');
    const nix = { ...base, discovery: { by: 'the Hubble team', date: '2005-06', note: 'Announced 31 October 2005' } };
    expect(originLine(nix)).toBe('Discovered in June 2005 by the Hubble team. Announced 31 October 2005.');
    const halley = { ...base, discovery: { by: 'Known since antiquity; Edmond Halley showed in 1705 that three comets were one', date: '1705', place: 'Oxford' } };
    expect(originLine(halley)).toBe('Discovery: Known since antiquity; Edmond Halley showed in 1705 that three comets were one (Oxford).');
    expect(originLine(base)).toBeNull();
  });

  it('gives a spacecraft’s launch and dated status', () => {
    const v2 = { ...base, mission: { launch: '1977-08-20T14:29:44Z', vehicle: 'Titan IIIE-Centaur', site: 'Cape Canaveral', status: 'Operating.', statusAsOf: '2026-08-20' } };
    expect(originLine(v2)).toBe('Launched on 20 August 1977 (Titan IIIE-Centaur, Cape Canaveral).');
    expect(statusLine(v2)).toBe('Operating (as of 20 August 2026).');
  });

  it('lists each source once, by site', () => {
    const r = {
      ...base,
      factSources: ['https://science.nasa.gov/a', 'https://doi.org/10.1/x', 'https://science.nasa.gov/a'],
      discovery: { by: 'A', date: '2000-01-01', source: 'https://www.science.nasa.gov/b' },
    };
    expect(sourceLinks(r)).toEqual([
      { url: 'https://science.nasa.gov/a', label: 'science.nasa.gov' },
      { url: 'https://doi.org/10.1/x', label: 'doi.org' },
      { url: 'https://www.science.nasa.gov/b', label: 'science.nasa.gov 2' },
    ]);
  });

  it('shows a fact without its author–year brackets (its Sources link the papers), and keeps every other bracket', () => {
    expect(cardFact('An ocean formed within the last 25 million years (Lainey et al. 2024).')).toBe('An ocean formed within the last 25 million years.');
    expect(cardFact('Salts and organic molecules (Postberg et al. 2023). Phosphorus is one of the elements life needs.')).toBe(
      'Salts and organic molecules. Phosphorus is one of the elements life needs.',
    );
    expect(cardFact('Its rings are tilted (Showalter & Hamilton 2015).')).toBe('Its rings are tilted.');
    expect(cardFact('Bright spots of salt (De Sanctis et al. 2016).')).toBe('Bright spots of salt.');
    expect(cardFact('Two telescopes saw it (Cordiner et al. 2020; Bodewits et al. 2020).')).toBe('Two telescopes saw it.');
    expect(cardFact('Voyager 2 passed Uranus (January 1986) and Neptune (August 1989).')).toBe('Voyager 2 passed Uranus (January 1986) and Neptune (August 1989).');
    expect(cardFact('Very dark (albedo 0.03 to 0.05), named by Messier (Messier, 1764).')).toBe('Very dark (albedo 0.03 to 0.05), named by Messier (Messier, 1764).');
  });

  it('keeps one short line in view where what is drawn is a model, and nothing where it is not', () => {
    expect(cardModelLine({ ...base, modelNotes: [NO_IMAGE_NOTE, 'Its orbit is assumed circular.'] })).toBe(NO_IMAGE_NOTE);
    expect(cardModelLine({ ...base, modelNotes: [MILKY_WAY_MODEL_LABEL] })).toBe(GALAXY_MODEL_LINE);
    expect(GALAXY_MODEL_LINE).not.toMatch(/et al\.|\d{4}/);
    expect(cardModelLine({ ...base, modelNotes: ['Rotation: the IAU’s model.'] })).toBeNull();
    expect(cardModelLine(base)).toBeNull();
  });
});

// ─── Black holes ─────────────────────────────────────────────────────────────────────────

/** Every black hole's record as the app registers it: Sgr A* (from sstars.json), M87* (in a stand-in M87), the binaries' and OGLE-2011-BLG-0462. */
function holeRecords(): BodyRecord[] {
  const sgrA = sgrARecord(sgrAFrom(SSTARS as Parameters<typeof sgrAFrom>[0]));
  const m87: BodyRecord = { id: 'm87', name: 'M87', kind: 'galaxy', parent: null, physical: { radiusKm: 1, colour: '#ffffff' }, provider: fixedOffsetProvider(0, 0, 0), deepSky: { type: 'Galaxy', distancePc: 16.8e6 } };
  const m87Star = m87StarRecord(holeJson('m87-star')!, m87);
  const binaries = binaryHoleRecords(BLACK_HOLES).filter((r) => r.kind === 'black-hole');
  const ogle = isolatedHoleRecord(holeJson('ogle-2011-blg-0462')!);
  // The other galaxies' holes: at a stand-in for their galaxy, or at their catalogue galaxy's place.
  const galaxies = BLACK_HOLES.holes
    .filter((h) => h.id !== 'm87-star' && (h.placement === 'galaxy-centre' || h.placement === 'catalogue-galaxy'))
    .map((h) => (h.placement === 'catalogue-galaxy' ? catalogueGalaxyHoleRecord(h) : galaxyHoleRecord(h, { ...m87, id: h.host!, name: h.hostName! })));
  return [sgrA, m87Star, ...binaries, ogle, ...galaxies];
}

/** A static observer's view of a hole of mass `msun` at r (units of GM/c²), as holeView gives it. */
function hovering(msun: number, rM: number): { v: HoleViewLike; rsKm: number; alpha: number } {
  const gm = msun * GM_SUN_KM3_S2;
  const mKm = gm / (C_KM_S * C_KM_S);
  const rsKm = 2 * mKm;
  const rKm = rM * mKm;
  const v: HoleViewLike = {
    heightKm: rKm - rsKm,
    rOverRs: rM / 2,
    frame: 'static',
    shadowRadius: shadowAngle(rM),
    einsteinRadius: einsteinAngle({ frame: 'static', r: rM }),
    thrustG: hoverAccelKmS2(gm, rKm) / G0_KM_S2,
  };
  return { v, rsKm, alpha: Math.sqrt(1 - 2 / rM) };
}

describe('a black hole’s card', () => {
  it('writes angles on the sky, heights and r in horizon radii in their natural units', () => {
    expect(skyAngleText(28.54 * DEG)).toBe('28.5°');
    expect(skyAngleText((12.3 / 60) * DEG)).toBe('12.3′');
    expect(skyAngleText((4.11 / 3600) * DEG)).toBe('4.11″');
    expect(skyAngleText((1.57 / 3.6e6) * DEG)).toBe('1.57 mas');
    expect(skyAngleText((53.25 / 3.6e9) * DEG)).toBe('53.3 µas');
    expect(heightText(27.4e-6)).toBe('27.4 mm');
    expect(heightText(0.85)).toBe('850 m');
    expect(heightText(12.69)).toBe('12.69 km');
    expect(heightText(4000 * AU_KM)).toBe('4000 au');
    // The HUD, the instruments, the label and the range readout write it the same way, the unit apart.
    expect(heightParts(4000 * AU_KM)).toEqual({ v: '4000', u: 'au' });
    expect(heightParts(6288 * AU_KM)).toEqual({ v: '6288', u: 'au' });
    expect(rsText(10, 9)).toBe('10.00');
    expect(rsText(1 + 1e-6, 1e-6)).toBe('1 + 1.0 × 10⁻⁶');
    expect(thrustText(3806.3)).toBe('3,806 g');
    expect(thrustText(3.6e6)).toBe('3.6 × 10⁶ g');
  });

  it('hovering 10 horizon radii above Sgr A*: shadow 28.5° across, Einstein ring 59.7°, clock ×1.054, 3,806 g', () => {
    const { v, rsKm, alpha } = hovering(4.297e6, 20);
    expect(holeHeightLine(v, rsKm)).toBe(`${heightText(9 * rsKm)} above the horizon (r = 10.00 r_s)`);
    const n = 1 / alpha;
    const here = holeFromHere(v, { near: true, clock: { n, nMinus1: n - 1 }, motion: 'hover', inside: false });
    expect(here).toEqual(['shadow 28.5° across', 'Einstein ring 59.7° across', 'your clock runs 1.054× slower than home’s', 'hovering here takes 3,806 g']);
  });

  it('far away gives only the shadow; at the hover floor the height in the horizon’s own units', () => {
    const d = 8277 * PARSEC_KM;
    const rsKm = (2 * 4.297e6 * GM_SUN_KM3_S2) / C_KM_S ** 2;
    const far: HoleViewLike = { heightKm: d - rsKm, rOverRs: d / rsKm, frame: 'static', shadowRadius: (Math.sqrt(27) / 2) * (rsKm / d), einsteinRadius: NaN, thrustG: 0 };
    expect(holeFromHere(far, { near: false, clock: null, motion: 'hover', inside: false })).toEqual(['shadow 53.3 µas across']);
    const floor: HoleViewLike = { heightKm: rsKm * 1e-6, rOverRs: 1 + 1e-6, frame: 'static', shadowRadius: shadowAngle(2 * (1 + 1e-6)), einsteinRadius: NaN, thrustG: 1e12 };
    expect(holeHeightLine(floor, rsKm)).toBe('12.69 km above the horizon (r = 1 + 1.0 × 10⁻⁶ r_s)');
    // Just above the horizon the shadow is nearly the whole sky: the card names what is left.
    expect(holeFromHere(hovering(4.297e6, 2.02).v, { near: true, clock: null, motion: 'hover', inside: false })[0]).toBe('shadow over all the sky but 29.7° overhead');
    // Hovering below r = 3.52 M the Einstein ring lies more than 90° from the hole: measured round the point overhead.
    const low = hovering(4.297e6, 2.02).v;
    expect(low.einsteinRadius).toBeGreaterThan(Math.PI / 2);
    const overhead = 2 * (Math.PI - low.einsteinRadius) * (180 / Math.PI);
    expect(overhead.toFixed(1)).toBe('25.4');
    expect(holeFromHere(low, { near: true, clock: null, motion: 'hover', inside: false })[1]).toBe('Einstein ring 25.4° across overhead');
    // Ten horizon radii out it is still round the hole.
    expect(holeFromHere(hovering(4.297e6, 20).v, { near: true, clock: null, motion: 'hover', inside: false })[1]).toBe('Einstein ring 59.7° across');
    // On a circular orbit (a geodesic) no thrust at all, whatever the rounding left in the hover formula (the shadow
    // here is a hovering observer's, 90° at 3 r_s; the orbiting camera's own is aberrated by holeView).
    const isco = { ...hovering(4.297e6, 6).v, thrustG: 7.8e-12 };
    expect(holeFromHere(isco, { near: true, clock: { n: Math.SQRT2, nMinus1: Math.SQRT2 - 1 }, motion: 'orbiting', inside: false })).toEqual([
      'shadow 90.0° across',
      'your clock runs 1.414× slower than home’s',
      'falling freely round it: no thrust',
    ]);
    // A faller at the horizon: the raindrop's dark patch, 84.2° across; no thrust.
    const fallAt: HoleViewLike = { heightKm: 0, rOverRs: 1, frame: 'rain', shadowRadius: raindropDarkRadius(2), einsteinRadius: NaN, thrustG: null };
    expect(holeFromHere(fallAt, { near: true, clock: null, motion: 'falling', inside: false })).toEqual(['dark patch ahead 84.2° across', 'falling freely: no thrust']);
  });

  it('shows each mass with its published uncertainties', () => {
    const [sgrA, m87Star] = holeRecords();
    expect(holeMassText(sgrA.blackHole!).v).toBe('(4.297 ± 0.012 ± 0.040) × 10⁶ M☉');
    expect(holeMassText(m87Star.blackHole!).v).toBe('(6.5 ± 0.2 ± 0.7) × 10⁹ M☉');
    const byId = new Map(holeRecords().map((r) => [r.id, r.blackHole!]));
    expect(holeMassText(byId.get('gaia-bh1')!).v).toBe('9.27 ± 0.10 M☉');
    expect(holeMassText(byId.get('maxi-j1820')!).v).toBe('8.48 +0.79 −0.72 M☉');
    expect(holeMassText(byId.get('v404-cygni')!).v).toBe('9.0 +0.2 −0.6 M☉');
    expect(holeMassText(byId.get('gaia-bh1')!).title).toMatch(/^1σ; /);
  });

  it('keeps at most three one-line notes on every hole’s card, the first its spin, and names assumed orbital elements', () => {
    const holes = holeRecords();
    expect(holes.map((r) => r.id).sort()).toEqual(BLACK_HOLES.holes.map((h) => h.id).sort());
    for (const r of holes) {
      const notes = r.modelNotes ?? [];
      expect(notes.length, r.id).toBeGreaterThan(0);
      expect(notes.length, r.id).toBeLessThanOrEqual(3);
      expect(notes[0], r.id).toMatch(/^Drawn without spin \(Schwarzschild\)/);
      // Label 15: a binary with assumed elements says so on its card.
      if (r.blackHole?.assumed?.length) expect(notes.some((n) => /orientation of its orbit on the sky/.test(n)), r.id).toBe(true);
    }
  });

  it('says spin as label 1 does: 5–7 % and 1 M at our angle to Sgr A*, 12 % edge-on, within the EHT’s 8 %', () => {
    const sgrA = holeRecords()[0];
    // The shift in words (1 M is half the horizon's radius).
    expect(sgrA.modelNotes![0]).toMatch(/0\.9–0\.94.*5–7 %.*(1 M|half its horizon’s radius)/);
    const sheet = sheetNotes(sgrA).join(' ');
    expect(sheet).toMatch(/about 25°/);
    expect(sheet).toMatch(/12 %/);
    expect(sheet).toMatch(/less than about 8 %/);
  });

  it('puts every note the card leaves out on the data sheet, each once', () => {
    for (const r of holeRecords()) {
      const sheet = sheetNotes(r);
      expect(new Set(sheet).size, r.id).toBe(sheet.length);
      for (const n of [r.positionNote, ...(r.blackHole?.sheetNotes ?? [])]) if (n) expect(sheet, r.id).toContain(n);
      // The card's own notes: each there, or the fuller note on its subject in its place.
      for (const n of r.modelNotes ?? []) expect(cardNoteOnSheet(r, n), `${r.id}: ${n}`).toBe(true);
      expect(sheet, r.id).toContain(LENS_SHEET_NOTE);
      // The spin once, in one line that says it is drawn without.
      expect(sheet.filter((n) => /\bspin\b/i.test(n) && !/^Position/.test(n) && !/fall into it/i.test(n)).length, r.id).toBe(1);
      expect(sheet.some((n) => n.startsWith('Drawn without spin (Schwarzschild). Spin ')), r.id).toBe(true);
      if (r.blackHole?.assumed?.length) expect(sheet.some((n) => n.startsWith('Assumed, not measured: ')), r.id).toBe(true);
      // A contested mass (label 22) is on the sheet: its own note, or the record's.
      if (r.blackHole?.massNote) expect(sheet.some((n) => /\bmass\b/i.test(n) || n.includes(r.blackHole!.massNote!.slice(0, 20))), r.id).toBe(true);
    }
    // Labels 2, 12, 13, 14 and 18 on Sgr A*'s sheet.
    const sgrA = sheetNotes(holeRecords()[0]).join(' ');
    for (const re of [/no white hole/, /accretion flow is a model/, /1\.3 mm view/, /statistical model of the nuclear star cluster/, /No dust/]) expect(sgrA).toMatch(re);
    // Each subject once: Sgr A*'s gas and cluster in their fuller notes only, Cygnus X-1's assumed orientation once.
    const sgrSheet = sheetNotes(holeRecords()[0]);
    expect(sgrSheet.filter((n) => /S2, S29, S38 and S55/.test(n))).toHaveLength(1);
    expect(sgrSheet.filter((n) => /^The glow round it|^The accretion flow is a model/.test(n))).toHaveLength(1);
    const cyg = holeRecords().find((r) => r.id === 'cyg-x-1')!;
    expect(sheetNotes(cyg).filter((n) => /orientation (of its orbit )?on the sky/.test(n) && !/^Position/.test(n))).toHaveLength(1);
    // The Milky Way's sheet names the statistical stars round Sgr A* (label 14).
    const mw = milkyWayRecord(sgrAFrom(SSTARS as Parameters<typeof sgrAFrom>[0]));
    expect(sheetNotes(mw)).toContain(NSC_SHEET_NOTE);
    expect(sheetNotes(base)).toEqual([]);
    // A hole's radius is its horizon's.
    expect(radiusReading(holeRecords()[0])).toMatchObject({ l: 'Horizon radius', u: 'km' });
  });

  it('merges the spin into one line: drawn without, what is measured, what a spin would change', () => {
    const gaia =
      'Drawn without spin (Schwarzschild): its spin is not measured; a fast spin would make its shadow up to 12 % narrower and shift it by up to 1.2 horizon radii, depending on the angle.';
    expect(holeSpinLine('Not measured: it takes in no gas, so no X-rays show its spin.', gaia)).toBe(
      'Drawn without spin (Schwarzschild). Spin not measured: it takes in no gas, so no X-rays show its spin. A fast spin would make its shadow up to 12 % narrower and shift it by up to 1.2 horizon radii, depending on the angle.',
    );
    // A record's note that says what spin would change needs nothing from the card's; its own "drawn without" goes.
    expect(holeSpinLine('Not measured: a fast spin would make its shadow a few per cent smaller.', gaia)).toBe(
      'Drawn without spin (Schwarzschild). Spin not measured: a fast spin would make its shadow a few per cent smaller.',
    );
    expect(
      holeSpinLine(
        'Claimed above 0.9985 of the maximum (Miller-Jones et al. 2021); drawn without.',
        'Drawn without spin (Schwarzschild), though it is claimed to spin at more than 99.8 % of the maximum.',
      ),
    ).toBe('Drawn without spin (Schwarzschild). Spin claimed above 0.9985 of the maximum (Miller-Jones et al. 2021).');
    // A closing bracket ends no sentence.
    expect(sentence('17.5 (+2 −1) in a 2025 re-analysis (Ramachandran et al. 2025)')).toBe('17.5 (+2 −1) in a 2025 re-analysis (Ramachandran et al. 2025).');
    expect(sentence('(See the Guide.)')).toBe('(See the Guide.)');
  });

  it('says where a deep-sky object is: “in the” a Magellanic Cloud, but “in” a galaxy by its own name', () => {
    expect(deepSkyDistanceLine({ type: 'Nebula', distancePc: 49_590, hostGalaxy: 'Large Magellanic Cloud', distanceSource: 'eclipsing binaries' })).toMatch(
      /from the Sun, in the Large Magellanic Cloud\. Distance: eclipsing binaries$/,
    );
    expect(deepSkyDistanceLine({ type: 'Black hole', distancePc: 16.8e6, hostGalaxy: 'Messier 87 (Virgo A)', distanceSource: 'its galaxy’s' })).toMatch(
      /from the Sun, in Messier 87 \(Virgo A\)\. Distance: its galaxy’s$/,
    );
    // The card shows the distance alone and keeps how it was measured under Sources.
    const orion = { type: 'Nebula', distancePc: 390, distanceSource: 'VLBA radio parallaxes (Kounkel et al. 2017)' };
    expect(deepSkyDistanceWords(orion)).toBe('1,270 light-years from the Sun');
    expect(deepSkyDistanceSource(orion)).toBe('Distance: VLBA radio parallaxes (Kounkel et al. 2017)');
    expect(deepSkyDistanceLine(orion)).toBe(`${deepSkyDistanceWords(orion)}. ${deepSkyDistanceSource(orion)}`);
    expect(deepSkyDistanceWords({ type: 'Galaxy' })).toBeNull();
  });

  it('shows an EHT picture only where the file ships, and lists exactly the files in public/images/eht/', () => {
    const dir = 'public/images/eht';
    const named = new Set(holeRecords().map((r) => r.blackHole?.ehtImage?.file));
    // Node's fs as src/test/files.ts reaches it (the app's TypeScript configuration has no Node types).
    const fs = (globalThis as unknown as { process: { getBuiltinModule(id: string): unknown } }).process.getBuiltinModule('node:fs') as { readdirSync(p: URL): string[] };
    const shipped = fileExists(dir) ? fs.readdirSync(new URL(`${dir}/`, REPO_ROOT)).map((f) => `images/eht/${f}`) : [];
    expect([...EHT_SHIPPED].sort()).toEqual(shipped.filter((f) => named.has(f)).sort());
    for (const f of EHT_SHIPPED) expect(fileExists(`public/${f}`), f).toBe(true);
  });

  it('credits the Event Horizon Telescope’s pictures as CC BY 4.0 asks, and says the 1.3 mm view is a model', () => {
    const withImage = holeRecords().filter((r) => r.blackHole?.ehtImage);
    expect(withImage.map((r) => r.id).sort()).toEqual(['m87-star', 'sgr-a-star']);
    for (const r of withImage) {
      const e = r.blackHole!.ehtImage!;
      expect(e.credit).toBe('EHT Collaboration');
      expect(e.licence).toBe('CC BY 4.0');
      expect(e.licenceUrl).toBe('https://creativecommons.org/licenses/by/4.0/');
      expect(e.modificationNote).toMatch(/resized/);
      expect(e.page).toMatch(/^https:\/\/www\.eso\.org\/public\/images\/eso/);
      expect(e.file).toMatch(/^images\/eht\/[a-z0-9-]+\.jpg$/);
    }
    const sgrA = withImage.find((r) => r.id === 'sgr-a-star')!.blackHole!.ehtImage!;
    expect(ehtCaption(sgrA.ringDiameterUas, sgrA.ringSource, FLOW_TEXTS.figureCaption)).toMatch(/51\.8 ± 2\.3 µas.*model, not this image/);
    const m87 = withImage.find((r) => r.id === 'm87-star')!.blackHole!.ehtImage!;
    expect(ehtCaption(m87.ringDiameterUas, m87.ringSource, null)).toBe(
      'The Event Horizon Telescope’s 2017 image: a reconstruction at 1.3 mm, ring 42 ± 3 µas across. Skyfold draws no gas round this black hole: only its shadow and the light it bends.',
    );
  });

  it('labels the models where they show: the menu hints and the layer cards (labels 12, 14 and 21)', () => {
    expect(LENSING_HINT).toMatch(/^Bends light round black holes exactly/);
    expect(LENSING_HINT).toMatch(/Off: light is drawn straight, so a black hole and the gas close round it cannot be seen \(from far away its gas still shows as a point\)/);
    expect(FLOW_TEXTS.menuHint).toMatch(/^A model of the hot gas/);
    expect(FLOW_LAYER_CARD.line).toMatch(/model/);
    expect(FLOW_LAYER_CARD.caveat).toMatch(/Never seen in visible light/);
    expect(FLOW_LAYER_CARD.more.join(' ')).toMatch(/flickers/);
    expect(NSC_LAYER_CARD.caveat).toMatch(/none is a real individual star except S2, S29, S38 and S55/);
    // The references go under the cards' Sources, not into the words they show.
    for (const card of [FLOW_LAYER_CARD, NSC_LAYER_CARD]) {
      expect([card.line, card.caveat, ...card.more].join(' '), card.title).not.toMatch(/et al\.|\(\d{4}/);
      expect(card.sources.join(' '), card.title).toMatch(/\(20\d\d/);
    }
    const view = KEY_GROUPS.find((g) => g.title === 'The view')!.rows.find((r) => r[0] === 'View menu')!;
    expect(view[1]).toMatch(/gravitational lensing and the accretion flow/);
  });

  it('never saves the black holes’ switches between visits', () => {
    const saved = savedPrefs(useUI.getState());
    for (const k of ['lensing', 'accretionFlow', 'accretionBand', 'ehtBlur', 'fallActive']) expect(Object.keys(saved)).not.toContain(k);
    const s = useUI.getState();
    expect([s.lensing, s.accretionFlow, s.accretionBand, s.ehtBlur, s.fallActive]).toEqual([true, true, 'visible', false, false]);
  });
});

// ─── The physics notes near a black hole ─────────────────────────────────────────────────

const NEW_NOTES = ['gravitational-blueshift', 'double-images', 'shadow-size'] as const;

/** A reference section's text, as the physics reference renders it (KaTeX's markup included). */
const sectionText = (id: (typeof NEW_NOTES)[number]): string => {
  const r = REFERENCE[id];
  return renderToStaticMarkup(createElement(Fragment, null, r.body, r.note)).replace(/&#x27;|&#39;/g, '’');
};

describe('the physics notes near a black hole', () => {
  it('are appended, so every earlier section keeps its number', () => {
    expect(EXPLAINERS.slice(-3).map((e) => e.id)).toEqual([...NEW_NOTES]);
    expect(sectionNo('rocket')).toBe(10);
    expect(NEW_NOTES.map(sectionNo)).toEqual([11, 12, 13]);
  });

  it('have equations KaTeX can set, and reading lists', () => {
    for (const id of NEW_NOTES) {
      expect(() => katex.renderToString(REFERENCE[id].equation, { throwOnError: true, displayMode: true }), id).not.toThrow();
      expect(REFERENCE[id].reading?.length, id).toBeGreaterThanOrEqual(3);
    }
  });

  it('point “Read more” at sections that exist', () => {
    for (const id of NEW_NOTES) {
      const t = EXPLAINER_ARTICLES[id];
      const path = `src/content/learn/articles/${t.slug}.md`;
      // Every article they point at is in the library (the one on black holes included).
      expect(fileExists(path), path).toBe(true);
      const slugs = readText(path)
        .split(/\r?\n/)
        .filter((l: string) => l.startsWith('## '))
        .map((l: string) => headingSlug(l.slice(3).trim()));
      expect(slugs, id).toContain(t.section);
    }
  });

  it('quote numbers the exact physics gives', () => {
    const across = (rad: number) => `${(2 * rad * (180 / Math.PI)).toFixed(1)}°`;
    const blue = sectionText('gravitational-blueshift');
    expect((1 / Math.sqrt(1 - 1 / 10)).toFixed(3)).toBe('1.054');
    expect((1 / Math.sqrt(1 - 1 / 1.01)).toFixed(2)).toBe('10.05');
    expect(blue).toMatch(/1\.054; at .*10\.05; at the lowest hover .*it is 1,000/s);
    expect(blue).toMatch(/at the horizon by\s+a factor of 2/);

    const lensed = sectionText('double-images');
    const mSgrKm = (4.297e6 * GM_SUN_KM3_S2) / C_KM_S ** 2;
    const ringAt = (au: number) => (einsteinAngle({ frame: 'static', r: (au * AU_KM) / mSgrKm }) * 180) / Math.PI;
    expect(ringAt(4000).toFixed(3)).toBe('0.374');
    expect(ringAt(1000).toFixed(3)).toBe('0.750');
    expect(lensed).toMatch(/0\.374° in radius .*0\.373°.*0\.750°/s);
    expect(((einsteinAngle({ frame: 'static', r: 20 }) * 180) / Math.PI).toFixed(1)).toBe('29.8');
    expect(((edgeAngle({ frame: 'static', r: 20 }) * 180) / Math.PI).toFixed(2)).toBe('14.27');
    expect(lensed).toMatch(/29\.8° in\s+radius .*14\.61°, just outside the shadow’s 14\.27°/s);

    const shadow = sectionText('shadow-size');
    const sgrRs = 2 * mSgrKm;
    const uas = (km: number) => ((km / (8277 * PARSEC_KM)) * 180 * 3600e6) / Math.PI;
    expect(uas(Math.sqrt(27) * mSgrKm * 2).toFixed(1)).toBe('53.3');
    expect(uas(2 * sgrRs).toFixed(1)).toBe('20.5');
    expect(shadow).toMatch(/53\.3 µas across while its horizon would span only 20\.5 µas/);
    expect(across(shadowAngle(20))).toBe('28.5°');
    expect(across(Math.PI - shadowAngle(2.02))).toBe('29.7°');
    expect(shadowAngle(3)).toBeCloseTo(Math.PI / 2, 12);
    expect(shadow).toMatch(/28\.5° across; at the photon sphere it is exactly half the sky; at .*29\.7°/s);
    // Aberration of the shadow's circle about the direction of motion: tan(θ′/2) = e^(∓φ) tan(θ/2), at 0.9c.
    const k = Math.sqrt(1.9 / 0.1);
    const t = Math.tan(shadowAngle(20) / 2);
    expect(across(2 * Math.atan(t / k))).toBe('6.6°');
    expect(Math.round(4 * Math.atan(t * k) * (180 / Math.PI))).toBe(114);
    expect(across(raindropDarkRadius(2))).toBe('84.2°');
    expect(shadow).toMatch(/6\.6° across, and climbing out at .*114° across/s);
    expect(shadow).toMatch(/84\.2° across/);
  });
});
