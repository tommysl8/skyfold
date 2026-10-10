/**
 * A CME's card (ui/viewport/LayerCards.tsx shows one for each front in view): when and where it left the Sun, how fast
 * and how wide, when it reached Earth and how strong the storm was. Pure functions of the table's row.
 */
import { kpText } from './kp';
import type { Cme } from './cmes';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "8 May 2024". */
export function dayText(ms: number, year = true): string {
  const d = new Date(ms);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year ? ` ${d.getUTCFullYear()}` : ''}`;
}

/** "16:36 UT". */
export const timeText = (ms: number): string => `${new Date(ms).toISOString().slice(11, 16)} UT`;

/** The day and time, the year left out when it is that of `ref`. */
const when = (ms: number, ref: number) => `${dayText(ms, new Date(ms).getUTCFullYear() !== new Date(ref).getUTCFullYear())}, ${timeText(ms)}`;

const kms = (v: number) => `${Math.round(v).toLocaleString('en-GB')} km/s`;

/** How far a model's arrival is from the measured one, in words. */
function offBy(model: number, measured: number): string {
  const h = (model - measured) / 3_600_000;
  if (Math.abs(h) < 0.5) return 'on time';
  const n = Math.abs(h) < 10 ? Math.abs(h).toFixed(1) : String(Math.round(Math.abs(h)));
  return `${n} hours ${h > 0 ? 'late' : 'early'}`;
}

export const CARRINGTON_ID = 'carrington-1859';

/** The DONKI page of a CME. */
export const donkiUrl = (c: Cme): string | null => (c.link ? `https://ccmc.gsfc.nasa.gov/DONKI/view/CME/${c.link}/-1` : null);

export interface CmeCard {
  title: string;
  line: string;
  caveat: string;
  more: string[];
  sources: string[];
  link: string | null;
}

/** The card of a CME. */
export function cmeCard(c: Cme): CmeCard {
  if (c.id === CARRINGTON_ID) return carringtonCard(c);
  const from = c.source ? ` from ${c.source}${c.region ? ` (active region ${c.region})` : ''}` : '';
  const width = Math.round(2 * c.halfAngleDeg);
  const line1 = `Seen leaving the Sun${from} at ${kms(c.speed)}, ${width}° wide.`;
  let arrival: string;
  if (c.arrivalMs !== null) {
    const kp = c.kp !== null ? ` Kp reached ${kpText(c.kp)}.` : '';
    arrival = c.fitted
      ? `Its shock reached Earth on ${when(c.arrivalMs, c.startMs)}.${kp}`
      : `It merged with other CMEs on the way: their shock reached Earth on ${when(c.arrivalMs, c.startMs)}.${kp}`;
  } else if (c.note?.at && c.note.time) {
    arrival = `It missed Earth; its shock reached ${c.note.at} at ${timeText(Date.parse(`${c.note.time}Z`))} the same day.`;
  } else if (c.drawnArrivalMs !== null) {
    arrival = `Heading for Earth by the model, but no shock at Earth is linked to it.${c.kp !== null ? ` Kp reached ${kpText(c.kp)} in the storm linked to it.` : ''}`;
  } else {
    arrival = c.kp !== null ? `A storm followed (Kp ${kpText(c.kp)}).` : 'It missed Earth.';
  }
  const gamma = (c.gamma * 1e7).toFixed(c.gamma < 0.1e-7 ? 3 : 2);
  const model = c.fitted
    ? `Its flight is the drag-based model (Vršnak et al. 2013) fitted to that arrival: drag ${gamma} × 10⁻⁷ km⁻¹ in a ${c.w} km/s wind.`
    : `Its flight is the drag-based model (Vršnak et al. 2013) with typical values: drag 0.2 × 10⁻⁷ km⁻¹ in a 400 km/s wind.`;
  const more = [model];
  if (c.fitted && c.arrivalMs !== null) {
    more.push(
      c.typicalArrivalMs !== null
        ? `With the typical values it would have arrived ${offBy(c.typicalArrivalMs, c.arrivalMs)}: forecasts made this way are typically off by about half a day.`
        : 'With the typical values and the measured width it would have missed Earth: the shock ahead of a CME is wider than the CME.',
    );
    if (c.halfWidth > ((c.halfAngleDeg + 0.5) * Math.PI) / 180)
      more.push(`Drawn ${Math.round((2 * c.halfWidth * 180) / Math.PI)}° wide, so that its front reaches Earth as its shock did.`);
  }
  if (c.id.startsWith('2012-07-23'))
    more.push('The fastest CME in the catalogue. Had it left the Sun a week earlier, it would have hit Earth (Baker et al. 2013).');
  more.push('Real CMEs are clouds of plasma and magnetic field seen only in coronagraphs and heliospheric imagers, by the sunlight their electrons scatter: here the front is drawn far brighter than it is.');
  const sources = [`NASA DONKI (CCMC): CME ${c.id}, its analysis${c.arrivalMs !== null ? ' and the interplanetary shock' : ''}.`];
  if (c.kp !== null) sources.push('Kp: GFZ Potsdam, Matzka et al. 2021 (CC BY 4.0).');
  if (c.note?.cite) sources.push(`${c.note.cite}.`);
  sources.push('Drag-based model: Vršnak et al. 2013, Solar Phys. 285, 295.');
  return {
    title: `CME of ${dayText(c.startMs)}, ${timeText(c.startMs)}`,
    line: `${line1} ${arrival}`,
    caveat: c.fitted ? 'Direction, speed and width as measured; its path a model fitted to the measured arrival.' : 'Direction, speed and width as measured; its path a model.',
    more,
    sources,
    link: donkiUrl(c),
  };
}

function carringtonCard(c: Cme): CmeCard {
  return {
    title: 'The Carrington event, 1859',
    line: `On 1 September 1859 at 11:18 UT Carrington and Hodgson saw the first flare ever recorded, in a great sunspot group near the middle of the Sun; 17.6 hours later the largest geomagnetic storm on record began. Aurora was seen as close as about 21° magnetic latitude.`,
    caveat: `No one measured the CME: its ${kms(c.speed)} is the speed that brings it to Earth in 17.6 hours; its ${Math.round(2 * c.halfAngleDeg)}° width is assumed.`,
    more: [
      'The flight is the drag-based model with the weak drag found for the extreme CME of July 2012 (0.01 × 10⁻⁷ km⁻¹ in a 450 km/s wind; Temmer & Nitta 2015), started at that speed from the Sun’s surface.',
      'The storm’s Dst was about −850 to −1,050 nT, twice May 2024’s or more; the oval of aurora reached down to 29–31° invariant latitude (Hayakawa et al. 2019). Kp was not yet measured: the aurora here is drawn at Kp 9, which reaches only as far as May 2024’s oval.',
    ],
    sources: [
      'Carrington 1859, MNRAS 20, 13; Hodgson 1859, MNRAS 20, 15.',
      'Transit time: Cliver & Svalgaard 2004, Solar Phys. 224, 407.',
      'Sunspot group, Dst and the aurora’s reach: Hayakawa et al. 2019, Space Weather 17, 1553.',
    ],
    link: null,
  };
}
