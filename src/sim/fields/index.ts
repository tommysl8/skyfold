/**
 * Magnetic field lines (docs/data/fields.md): the small part that comes with the app. The lines themselves (the
 * models' coefficients, the tracer in a worker, scene/FieldLines.tsx and its material) are a chunk of their own,
 * fetched the first time View › Magnetic field lines is turned on; until then nothing of them is downloaded, and while
 * it is off nothing is drawn.
 *
 * Here: each body's field in a line for its card (its dipole's field at the equator, tilt and offset, worked out from
 * the models and checked against them in fields.test.ts), and what the chunk reports of the Sun's map at the date.
 */
import { dipoleAt } from '../phenomena/aurora';

export interface FieldFacts {
  /** Model and paper. */
  model: string;
  cite: string;
  doi: string;
  /** The centred dipole's field at the equator, nT. */
  b0nT: number;
  /** Its tilt from the spin axis, degrees. */
  tiltDeg: number;
  /** How far the best-fitting (eccentric) dipole sits from the centre, km (null: not given by the model). */
  offsetKm: number | null;
  /** A clause on what the model leaves out, for the card. */
  note?: string;
}

/** The planets' (and Ganymede's) fields, as sim/fields/models.ts gives them (Earth's for 2025; its card reads the date's). */
export const FIELD_FACTS: Readonly<Record<string, FieldFacts>> = {
  mercury: { model: 'MESSENGER offset dipole', cite: 'Anderson et al. 2012', doi: 'https://doi.org/10.1029/2012JE004159', b0nT: 190, tiltDeg: 0, offsetKm: 479, note: 'its tilt is under 0.8°' },
  earth: { model: 'IGRF-14', cite: 'IAGA', doi: 'https://www.ncei.noaa.gov/products/international-geomagnetic-reference-field', b0nT: 29_733, tiltDeg: 9.21, offsetKm: 605 },
  jupiter: { model: 'JRM33', cite: 'Connerney et al. 2022', doi: 'https://doi.org/10.1029/2021JE007055', b0nT: 417_659, tiltDeg: 10.25, offsetKm: 7_810 },
  saturn: { model: 'Cassini 11+', cite: 'Cao et al. 2020', doi: 'https://doi.org/10.1016/j.icarus.2019.113541', b0nT: 21_141, tiltDeg: 0, offsetKm: 2_260, note: 'its tilt is under 0.007°' },
  uranus: { model: 'AH5', cite: 'Herbert 2009', doi: 'https://doi.org/10.1029/2009JA014394', b0nT: 22_454, tiltDeg: 59.85, offsetKm: 9_970 },
  neptune: { model: 'O8', cite: 'Connerney, Acuña & Ness 1991', doi: 'https://doi.org/10.1029/91JA01165', b0nT: 14_243, tiltDeg: 46.9, offsetKm: 12_020 },
  ganymede: {
    model: 'permanent dipole',
    cite: 'Kivelson et al. 2002',
    doi: 'https://doi.org/10.1006/icar.2002.6834',
    b0nT: 719,
    tiltDeg: 4,
    offsetKm: null,
    note: 'the part induced by Jupiter’s changing field is left out',
  },
};

/** The map the chunk last drew the Sun's lines from (scene/FieldLines.tsx writes it; rotation 0: none yet). */
export const sunFieldShown: { rotation: number; startMs: number; held: 'before' | 'after' | null } = { rotation: 0, startMs: 0, held: null };

/** The chunk's meshes by body, for the development tools (import this module in the console). */
export const fieldLinesDebug: { meshes: Record<string, unknown> } = { meshes: {} };

const gauss = (nT: number) => {
  const g = nT / 1e5;
  return g >= 0.1 ? `${g.toFixed(g >= 1 ? 2 : 3)} G` : `${Math.round(nT).toLocaleString('en-GB')} nT`;
};

const km = (v: number) => `${(Math.round(v / 10) * 10).toLocaleString('en-GB')} km`;

/** The body's field in a sentence for its card, or null when no model is drawn for it. */
export function fieldLine(id: string, year: number): string | null {
  if (id === 'sun') {
    return 'Magnetic field: the corona’s as a potential field out to 2.5 solar radii, from SDO/HMI’s map of the photosphere for the Carrington rotation of the date, and beyond as Parker spirals for a 400 km/s wind, to 3 au.';
  }
  const f = FIELD_FACTS[id];
  if (!f) return null;
  let b0 = f.b0nT;
  let tilt = f.tiltDeg;
  if (id === 'earth') {
    const [g10, g11, h11] = dipoleAt(year);
    b0 = Math.hypot(g10, g11, h11);
    tilt = (Math.acos(Math.abs(g10) / b0) * 180) / Math.PI;
  }
  const t = tilt === 0 ? 'aligned with the spin axis' : `tilted ${tilt.toFixed(tilt < 10 ? 1 : 0)}° from the spin axis`;
  const off = f.offsetKm ? ` and ${km(f.offsetKm)} off centre` : '';
  const note = f.note ? `; ${f.note}` : '';
  return `Magnetic field: ${gauss(b0)} at the equator, the dipole ${t}${off}${note} (${f.model}, ${f.cite}).`;
}

/** What the drawn lines leave out, for the card. */
export function fieldDrawnNote(id: string): string {
  if (id === 'sun') return 'The coronal field is current-free up to the source surface, as the model assumes; it changes from one rotation to the next.';
  if (id === 'ganymede') return 'Drawn to about 2 Ganymede radii upstream; beyond, its lines join Jupiter’s field, which is not drawn there.';
  return 'Drawn: the planet’s own field, cut at a model magnetopause for a typical solar wind; the stretched tail and the currents outside the planet are not modelled.';
}
