/**
 * The supernovae of the Milky Way and its neighbour seen from Earth with known dates and places (docs/data/phenomena.md
 * §1): SN 1006, SN 1054, SN 1181, SN 1572, SN 1604 and SN 1987A. For each, when it was first seen, where, how far, its
 * light curve as Earth saw it, and how its debris has grown since, from the papers cited with each number.
 *
 * Time: every date is a proleptic Gregorian one, as the app's clock shows (a record dated in the Julian calendar is
 * converted: 6 days are added in the 11th century, 7 in the 12th, 10 in 1572). The light curve is the one Earth saw,
 * and the debris is shown at the age it had when the light now reaching Earth left it: the age is counted from when
 * the explosion's light reached Earth, everywhere, as the app draws the deep sky as Earth sees it (at the Crab itself
 * the explosion happened 6,500 years before its light arrived; that is left out, and the cards say so).
 *
 * The debris (supernovae.test.ts): the forward shock runs out freely at the ejecta's speed, then slows as it sweeps up
 * the gas round it, R = R₀ (t/t₀)^m, with R₀ today's radius (angular radius × distance) and m the expansion parameter
 * the remnant's measured proper motion gives (m = μ t₀ / θ, which needs no distance); the radius is the smaller of the
 * two laws. The Crab is a pulsar wind nebula, not a shell: its filaments expand faster than they did, R ∝ t^1.06 (their
 * speeds are 1.06 times the age's average: Martin et al. 2025), and its picture is drawn at that size (scene/Nebulae).
 */
import { bvToTemperature } from '../../physics/blackbody';
import { JULIAN_YEAR_S, PARSEC_KM } from '../../physics/constants';
import { msFromCivil } from '../../lib/time';
import { lastDayBrighterThan, magnitudeAt, NONE, temperatureAt, type LightCurve } from './lightCurve';

const DAY_MS = 86_400_000;
const YEAR_MS = JULIAN_YEAR_S * 1000;
/** km per pc per arcsec: an angle of 1″ at d pc spans d × this km (1 au × d). */
const KM_PER_ARCSEC_PC = PARSEC_KM / 206_264.806;

/** ms of a date in the Julian calendar (0 h UT), from its Julian Day Number (Meeus, Astronomical Algorithms ch. 7). */
export function msFromJulianCalendar(year: number, month: number, day: number, hour = 0): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  const jdn = day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
  return (jdn - 0.5 - 2_440_587.5) * DAY_MS + hour * 3_600_000;
}

/** A light curve's colours as observed B−V (reddened by the dust in front, as the stars' catalogue colours are), turned into temperatures. */
const fromBv = (days: readonly number[], bv: readonly number[]) => ({ teffDays: days, teffK: bv.map(bvToTemperature) });

/** An SN Ia's intrinsic B−V through its light curve (days from maximum in V): Phillips et al. 1999's Lira law from day 30 to 90, a normal Ia's colour before (Hsiao et al. 2007's template, rounded). */
const IA_BV_DAYS = [-15, -5, 0, 15, 30, 60, 90, 150];
const IA_BV = [0.1, -0.05, 0, 0.5, 1.0, 0.725, 0.371, 0.3];
const iaColours = (ebv: number, shiftDays = 0) => fromBv(IA_BV_DAYS.map((d) => d + shiftDays), IA_BV.map((c) => c + ebv));

export type ExplosionKind = 'Ia' | 'Iax' | 'core-collapse' | 'II-pec';

export interface Supernova {
  /** Body id: "sn-1054". */
  id: string;
  name: string;
  aliases: readonly string[];
  kind: ExplosionKind;
  /** What it was, for the card ("Type Ia supernova: a white dwarf blown apart"). */
  typeText: string;
  typeSource: string;
  /** First seen, ms, and the record of it in words (with the calendar). */
  firstSeenMs: number;
  firstSeenText: string;
  /** The light curve's day 0, ms (its maximum, or the explosion for SN 1987A). */
  zeroMs: number;
  /** When the explosion's light reached Earth, ms (the debris's age is counted from here). */
  explosionMs: number;
  explosionNote: string;
  curve: LightCurve;
  /** Peak brightness in words, with its source. */
  peakText: string;
  /** How long it was seen, in words. */
  seenForText: string;
  curveSources: readonly string[];
  /** Where (J2000), and the source. */
  raDeg: number;
  decDeg: number;
  positionSource: string;
  distancePc: number;
  distanceLoPc: number;
  distanceHiPc: number;
  distanceSource: string;
  /** The photosphere's speed early on, km/s (its radius grows as v t), and the outermost ejecta's (the shock's free run). */
  photosphereKmS: number;
  ejectaKmS: number;
  ejectaSource: string;
  /** Today's remnant: angular radius ″ at an epoch (year), and the expansion parameter m (R ∝ t^m), with sources. */
  remnant: { name: string; radiusArcsec: number; epochYear: number; m: number; source: string; bodyId?: string; snrId?: string };
  facts: readonly string[];
  factSources: readonly string[];
  factSourceLabels: readonly string[];
  /** Shown in visible light as a picture (the Crab): the model draws only the explosion, the picture the remnant. */
  pictureRemnant?: boolean;
}

// ─── The six ──────────────────────────────────────────────────────────────────────────

const RL04 = 'Ruiz-Lapuente 2004, ApJ 612, 357';
const RL17 = 'Ruiz-Lapuente 2017, ApJ 842, 112';
const SG02 = 'Stephenson & Green 2002, Historical Supernovae and their Remnants (Oxford), as tabulated by Tominaga, Blinnikov & Nomoto 2013, ApJL 771, L12';

/** SN 1572: Tycho's light curve, V against days from maximum (21 November 1572, Julian), Ruiz-Lapuente 2004 table 1 (Tycho's and others' records); the point before the first record is a model of the rise. */
const TYCHO_DAYS = [-16, -10, -5, 24, 55, 101, 161, 253, 345, 359, 406, 451];
const TYCHO_V = [1.0, -3.0, -4.0, -2.4, -1.4, 0.3, 1.6, 2.5, 4.0, 4.2, 4.7, 5.3];
/** The late decline of a normal SN Ia, 1.4 mag per 100 days (Ruiz-Lapuente 2004's fit to Tycho). */
const IA_TAIL = 0.014;

export const SUPERNOVAE: readonly Supernova[] = [
  {
    id: 'sn-1006',
    name: 'SN 1006',
    aliases: ['Supernova of 1006', 'SN1006', 'the new star of 1006', 'brightest supernova'],
    kind: 'Ia',
    typeText: 'Type Ia supernova: a white dwarf blown apart',
    typeSource: 'Winkler, Gupta & Long 2003, ApJ 585, 324; Katsuda 2017, Handbook of Supernovae',
    firstSeenMs: msFromJulianCalendar(1006, 4, 30, 14),
    firstSeenText: '30 April 1006 (Julian calendar; 6 May in the app’s Gregorian dates), recorded in China, Egypt, Iraq, Japan and Switzerland',
    zeroMs: msFromJulianCalendar(1006, 5, 5, 0),
    explosionMs: msFromJulianCalendar(1006, 5, 5, 0) - 18 * DAY_MS,
    explosionNote: 'Its light rose for about 18 days before its maximum, as a normal type Ia’s does (a template: nobody saw the rise)',
    curve: {
      // Tycho's light curve (Ruiz-Lapuente 2004) as the template, scaled to SN 1006's peak.
      days: TYCHO_DAYS,
      vmag: TYCHO_V.map((v) => v - (-4.0) + -7.5),
      riseDays: 4,
      tailMagPerDay: IA_TAIL,
      ...iaColours(0.11),
    },
    peakText: 'V ≈ −7.5 ± 0.4 at its peak (Winkler, Gupta & Long 2003, from a type Ia’s peak luminosity, its distance and its dust), the brightest star ever recorded; the records suggest anything from −5 to −8.5',
    seenForText: 'about two years to the naked eye (accounts differ: nearly two years, or more than three)',
    curveSources: ['Winkler, Gupta & Long 2003, ApJ 585, 324 (peak)', `${RL04} (the type Ia light curve, from SN 1572, as a template: SN 1006’s own records are too sparse)`, 'Phillips et al. 1999, AJ 118, 1766 (colours)'],
    raDeg: 225.7083,
    decDeg: -41.9333,
    positionSource: 'Green’s catalogue of Galactic supernova remnants (2024): 15h 02m 50s, −41° 56′',
    distancePc: 2180,
    distanceLoPc: 1570,
    distanceHiPc: 2260,
    distanceSource: 'Winkler, Gupta & Long 2003 (the Balmer filaments’ proper motion and shock speed), as the deep-sky remnants use it; with a revised shock speed it is 1.57 ± 0.07 kpc (Katsuda 2017)',
    photosphereKmS: 10_000,
    ejectaKmS: 20_000,
    ejectaSource: 'a normal type Ia’s outermost ejecta, about 20,000 km/s (Mazzali et al. 2007, Science 315, 825), its photosphere about 10,000 km/s (Si II near maximum) (Si II near maximum)',
    remnant: {
      name: 'SN 1006’s remnant',
      radiusArcsec: 900,
      epochYear: 2003,
      m: 0.5,
      source: 'radius 15′ (Green 2024); its shock moves 2,900 km/s in the north-west and up to 2.5 times faster in the south-east (Winkler et al. 2003, 2014): an expansion parameter of about 0.3 to 0.8, taken as 0.5',
      snrId: 'snr-g327-6p14-6',
    },
    facts: [
      'Seen in May 1006, the brightest new star in recorded history: Chinese astronomers wrote that things could be seen by its light.',
      'A white dwarf blown apart: no star remains at its centre, and its debris is now 60 light-years across.',
    ],
    factSources: ['https://doi.org/10.1086/345985', 'https://ui.adsabs.harvard.edu/abs/2014ApJ...781...65W'],
    factSourceLabels: ['Winkler, Gupta & Long 2003', 'Winkler et al. 2014'],
  },
  {
    id: 'sn-1054',
    name: 'SN 1054',
    aliases: ['Supernova of 1054', 'SN1054', 'the new star of 1054', 'guest star of 1054', 'Crab supernova'],
    kind: 'core-collapse',
    typeText: 'Core-collapse supernova: a massive star’s core fell in and became the Crab Pulsar',
    typeSource: 'Sollerman, Kozma & Lundqvist 2001, A&A 366, 197; possibly an electron-capture supernova (Tominaga, Blinnikov & Nomoto 2013)',
    firstSeenMs: msFromJulianCalendar(1054, 7, 4, 21),
    firstSeenText: '4 July 1054 (Julian calendar; 10 July in the app’s Gregorian dates), the “guest star” of the Song dynasty’s astronomers, before dawn in Taurus',
    zeroMs: msFromJulianCalendar(1054, 7, 4, 21),
    explosionMs: msFromJulianCalendar(1054, 7, 4, 21) - 14 * DAY_MS,
    explosionNote: 'When it exploded is not recorded (weeks before it was first seen, Collins, Claspy & Martin 1999); two weeks are taken',
    curve: {
      // The three recorded points (as bright as Venus on 4 July, −3 when it left the daylight sky on 27 July, +6 on
      // 6 April 1056), joined by a model: a short plateau, a drop, then the radioactive tail.
      days: [0, 23, 70, 110, 642],
      vmag: [-4.5, -3.0, -2.0, 0.6, 6.0],
      riseDays: 10,
      tailMagPerDay: 0.0098,
      ...fromBv([0, 30, 120], [0.9, 1.2, 1.4]),
    },
    peakText: 'V ≈ −4.5 when first seen, “as bright as Venus” (Stephenson & Green 2002; estimates run from −3.5 to −5); seen in daylight for 23 days',
    seenForText: '23 days in daylight and 642 days at night, to 6 April 1056 (Julian)',
    curveSources: [`${SG02} (the three recorded points)`, 'Collins, Claspy & Martin 1999, PASP 111, 871', 'between them a model: a short plateau, a drop and the radioactive tail of cobalt-56 (0.0098 mag a day)'],
    raDeg: 83.6324,
    decDeg: 22.0174,
    positionSource: 'SIMBAD (M 1), as the Crab Nebula’s',
    distancePc: 2000,
    distanceLoPc: 1500,
    distanceHiPc: 2500,
    distanceSource: 'Trimble 1973, PASP 85, 579, as the Crab Nebula’s; the pulsar’s radio parallax gives 1.90 (+0.22 −0.18) kpc (Lin et al. 2023)',
    photosphereKmS: 5_000,
    ejectaKmS: 5_000,
    ejectaSource: 'a type II supernova’s photosphere, a few thousand km/s; the filaments now move 1,400–2,300 km/s (Woltjer 1972; Clark 1983)',
    remnant: {
      name: 'Crab Nebula',
      radiusArcsec: 210,
      epochYear: 2000,
      m: 1.06,
      source: 'the Crab Nebula’s picture (7′ across); its filaments move 1.06 times faster than their age would give, pushed by the pulsar’s wind (Martin et al. 2025, convergence date 1105.5; Nugent 1998: 1130 ± 16)',
      bodyId: 'crab-nebula',
    },
    pictureRemnant: true,
    facts: [
      'Chinese astronomers saw this “guest star” by day for 23 days in July 1054; it stayed visible at night for nearly two years.',
      'It left the Crab Nebula and, at its heart, the Crab Pulsar, spinning 30 times a second.',
    ],
    factSources: ['https://ui.adsabs.harvard.edu/abs/2013ApJ...771L..12T', 'https://doi.org/10.1086/316401'],
    factSourceLabels: ['Tominaga, Blinnikov & Nomoto 2013', 'Collins, Claspy & Martin 1999'],
  },
  {
    id: 'sn-1181',
    name: 'SN 1181',
    aliases: ['Supernova of 1181', 'SN1181', 'the new star of 1181', 'Pa 30', 'Parker’s star', 'IRAS 00500+6713'],
    kind: 'Iax',
    typeText: 'Type Iax supernova: a white dwarf only partly blown apart, the rest still shining at its centre',
    typeSource: 'Ritter et al. 2021, ApJL 918, L33; Schaefer 2023, MNRAS 523, 3885',
    firstSeenMs: msFromJulianCalendar(1181, 8, 6, 14),
    firstSeenText: '6 August 1181 (Julian calendar; 13 August in the app’s Gregorian dates), in Cassiopeia, recorded in southern China, then Japan and northern China',
    zeroMs: msFromJulianCalendar(1181, 8, 6, 14),
    explosionMs: msFromJulianCalendar(1181, 8, 6, 14) - 15 * DAY_MS,
    explosionNote: 'Taken as 15 days before it was first seen, a type Iax’s rise (a template)',
    curve: {
      // Peak V between 0 and −1.4 (Schaefer 2023) or −0.5 and +1 (Ritter 2021): −0.5. A type Iax's fast decline, then
      // its slower tail, to V ≈ 6 when the records lose it 185 days on.
      days: [0, 15, 40, 185],
      vmag: [-0.5, 0.8, 2.0, 6.0],
      riseDays: 8,
      tailMagPerDay: 0.028,
      ...fromBv([0, 40, 185], [1.0, 1.5, 1.6]),
    },
    peakText: 'V ≈ −0.5 at its peak, between Ritter et al. 2021’s −0.5 to +1 and Schaefer 2023’s 0 to −1.4; “like Saturn”, the Japanese record says',
    seenForText: '185 days, to 6 February 1182 (Julian)',
    curveSources: ['Schaefer 2023, MNRAS 523, 3885 (dates, peak, duration)', 'Ritter et al. 2021, ApJL 918, L33', 'the shape between is a type Iax template (Foley et al. 2013, ApJ 767, 57), fitted to the 185 days'],
    raDeg: 13.29667,
    decDeg: 67.50067,
    positionSource: 'its central star, 00h 53m 11.2s +67° 30′ 02.4″ (Ritter et al. 2021)',
    distancePc: 2300,
    distanceLoPc: 2160,
    distanceHiPc: 2460,
    distanceSource: 'the Gaia parallax of its central star (Bailer-Jones et al. 2021, via Ritter et al. 2021); Schaefer 2023 gives 2.41 kpc',
    photosphereKmS: 5_000,
    ejectaKmS: 1_100,
    ejectaSource: 'its filaments fly out ballistically at about 1,000–1,100 km/s (Ritter et al. 2021; Cunningham et al. 2024, ApJL 975, L7)',
    remnant: {
      name: 'Pa 30',
      radiusArcsec: 100,
      epochYear: 2021,
      m: 1,
      source: 'outer radius 100″ ± 10″ (Ritter et al. 2021); expanding ballistically (Cunningham et al. 2024)',
    },
    facts: [
      'Seen for six months in 1181; for decades the pulsar wind nebula 3C 58 was thought its remnant, until the nebula Pa 30 was matched to it in 2021.',
      'A white dwarf only partly destroyed: what survived still shines at the centre at 200,000 K, throwing out a wind that streaks the nebula with filaments.',
    ],
    factSources: ['https://doi.org/10.3847/2041-8213/ac2253', 'https://doi.org/10.1093/mnras/stad717'],
    factSourceLabels: ['Ritter et al. 2021', 'Schaefer 2023'],
  },
  {
    id: 'sn-1572',
    name: 'SN 1572',
    aliases: ['Tycho’s Supernova', 'Tycho’s Nova', 'Tychos supernova', 'SN1572', 'B Cassiopeiae', 'the new star of 1572'],
    kind: 'Ia',
    typeText: 'Type Ia supernova: a white dwarf blown apart',
    typeSource: `${RL04}; Krause et al. 2008, Nature 456, 617 (the spectrum of its light echo)`,
    firstSeenMs: msFromJulianCalendar(1572, 11, 6, 18),
    firstSeenText: '6 November 1572 (Julian calendar; 16 November in the app’s Gregorian dates) in Wittenberg and Messina; Tycho Brahe saw it on 11 November',
    zeroMs: msFromJulianCalendar(1572, 11, 21, 0),
    explosionMs: msFromJulianCalendar(1572, 11, 21, 0) - 18 * DAY_MS,
    explosionNote: 'Its light rose for about 18 days to its maximum on 21 November (Julian), as a normal type Ia’s does',
    curve: { days: TYCHO_DAYS, vmag: TYCHO_V, riseDays: 4, tailMagPerDay: IA_TAIL, ...fromBv([0, 10, 41, 55, 99, 175], [0.82, 1.0, 1.52, 1.36, 0.82, 0.82]) },
    peakText: 'V = −4.0 ± 0.3 at its peak (Baade 1945; Ruiz-Lapuente 2004), as bright as Venus',
    seenForText: 'about 16 months, to March 1574',
    curveSources: [`${RL04}, table 1 (Tycho’s and his contemporaries’ estimates) and table 2 (its colours, from Tycho’s comparisons with Venus, Jupiter, Aldebaran and Mars)`, 'Baade 1945, ApJ 102, 309'],
    raDeg: 6.34417,
    decDeg: 64.14242,
    positionSource: 'the best-fitting explosion site, 00h 25m 22.6s +64° 08′ 32.7″ (Williams et al. 2016, ApJL 823, L32)',
    distancePc: 4000,
    distanceLoPc: 2500,
    distanceHiPc: 5000,
    distanceSource: 'Hayato et al. 2010, ApJ 725, 894 (4 ± 1 kpc), as the deep-sky remnants use it; others give 2.5–3 kpc (Tian & Leahy 2011) or 2.8 kpc (Ruiz-Lapuente 2004)',
    photosphereKmS: 10_000,
    ejectaKmS: 20_000,
    ejectaSource: 'a normal type Ia’s outermost ejecta, about 20,000 km/s (Mazzali et al. 2007, Science 315, 825), its photosphere about 10,000 km/s (Si II near maximum); today its silicon and iron move 4,000–4,700 km/s (Hayato et al. 2010)',
    remnant: {
      name: 'Tycho’s remnant',
      radiusArcsec: 240,
      epochYear: 2010,
      m: 0.53,
      source: 'radius 4′ (Green 2024); proper motions of its forward shock 0.17–0.41″ a year (Katsuda et al. 2010; Williams et al. 2016): an expansion parameter of about 0.5',
      snrId: 'snr-g120-1p1-4',
    },
    facts: [
      'Tycho Brahe measured that it did not move against the stars: it was far beyond the Moon, and the heavens were not unchanging.',
      'In 2008 its light, echoing off dust 400 years later, showed the spectrum of a type Ia supernova.',
    ],
    factSources: ['https://ui.adsabs.harvard.edu/abs/2004ApJ...612..357R', 'https://ui.adsabs.harvard.edu/abs/2008Natur.456..617K'],
    factSourceLabels: ['Ruiz-Lapuente 2004', 'Krause et al. 2008'],
  },
  {
    id: 'sn-1604',
    name: 'SN 1604',
    aliases: ['Kepler’s Supernova', 'Keplers supernova', 'Kepler’s Nova', 'SN1604', 'the new star of 1604'],
    kind: 'Ia',
    typeText: 'Type Ia supernova: a white dwarf blown apart',
    typeSource: RL17,
    firstSeenMs: msFromCivil(1604, 10, 9, 18),
    firstSeenText: '9 October 1604 (Gregorian) in Italy, beside Jupiter, Saturn and Mars in Ophiuchus; Johannes Kepler saw it on 17 October',
    zeroMs: msFromCivil(1604, 10, 31),
    explosionMs: msFromCivil(1604, 10, 31) - 18 * DAY_MS,
    explosionNote: 'Its light rose for about 18 days to its maximum around 31 October',
    curve: {
      // Ruiz-Lapuente 2017 tables 1–2 (European and Korean records), V against days from maximum.
      days: [-23, -22, -21, -20, -19, -16, -14, -12, -3, 4, 9, 15, 73, 80, 114, 147, 171, 174, 301, 316, 341],
      vmag: [3.0, 0.9, 0.5, -0.7, -1.5, -2.2, -2.6, -2.55, -2.95, -2.95, -1.95, -1.35, 0.0, 0.8, 2.3, 2.25, 2.4, 2.9, 4.45, 4.95, 4.7],
      riseDays: 3,
      tailMagPerDay: IA_TAIL,
      ...iaColours(0.9),
    },
    peakText: 'V ≈ −3 at its peak at the end of October 1604 (Ruiz-Lapuente 2017; −3.02 ± 0.10, Schaefer 1996), brighter than Jupiter beside it',
    seenForText: 'about a year, to October 1605 (lost in the Sun’s glare in November and December 1604)',
    curveSources: [`${RL17}, tables 1–2 (European and Korean records)`, 'colours: a type Ia’s (Phillips et al. 1999), reddened by its dust, E(B−V) = 0.9 (Ruiz-Lapuente 2017)'],
    raDeg: 262.66879,
    decDeg: -21.48733,
    positionSource: 'SIMBAD (Kepler’s SNR), 17h 30m 40.5s −21° 29′ 14″',
    distancePc: 5100,
    distanceLoPc: 4400,
    distanceHiPc: 5900,
    distanceSource: 'Sankrit et al. 2016, ApJ 817, 36, as the deep-sky remnants use it; estimates range from 3.3 to 7 kpc',
    photosphereKmS: 10_000,
    ejectaKmS: 20_000,
    ejectaSource: 'a normal type Ia’s outermost ejecta, about 20,000 km/s (Mazzali et al. 2007, Science 315, 825), its photosphere about 10,000 km/s (Si II near maximum)',
    remnant: {
      name: 'Kepler’s remnant',
      radiusArcsec: 90,
      epochYear: 2008,
      m: 0.6,
      source: 'radius 1.5′ (Green 2024); its shock moves 1,700 km/s in the north and several times faster elsewhere (Sankrit et al. 2016; Katsuda et al. 2008; Vink 2008): an expansion parameter of about 0.5–0.6',
      snrId: 'snr-g4-5p6-8',
    },
    facts: [
      'The last supernova seen in the Milky Way: Kepler followed it for a year and wrote a book about it, De Stella Nova (1606).',
      'It appeared beside Jupiter and Saturn, which were in conjunction, so astrologers were already watching that part of the sky.',
    ],
    factSources: ['https://ui.adsabs.harvard.edu/abs/2017ApJ...842..112R', 'https://ui.adsabs.harvard.edu/abs/2016ApJ...817...36S'],
    factSourceLabels: ['Ruiz-Lapuente 2017', 'Sankrit et al. 2016'],
  },
  {
    id: 'supernova-1987a',
    name: 'Supernova 1987A',
    aliases: ['SN1987A', 'SN 1987A explosion', 'Sanduleak −69 202', 'Sk −69 202', '1987A'],
    kind: 'II-pec',
    typeText: 'Core-collapse supernova (peculiar type II) of a blue supergiant',
    typeSource: 'Arnett et al. 1989, ARA&A 27, 629',
    firstSeenMs: msFromCivil(1987, 2, 24, 5, 31),
    firstSeenText: '24 February 1987, by Ian Shelton at Las Campanas at magnitude 5; its neutrinos had reached Earth at 07:35:35 UT on 23 February',
    zeroMs: msFromCivil(1987, 2, 23, 7, 35, 35),
    explosionMs: msFromCivil(1987, 2, 23, 7, 35, 35),
    explosionNote: 'The neutrinos of its core’s collapse reached Earth at 07:35:35 UT on 23 February 1987 (Kamiokande-II; Hirata et al. 1987)',
    curve: {
      // Measured V (Open Supernova Catalog compilation; Guillochon et al. 2017) from the papers cited.
      days: [0.12, 1.5, 3.62, 6.53, 10.58, 16.43, 21.45, 31.43, 40.49, 51.42, 61.42, 73.4, 85.4, 99.39, 109.38, 116.38, 134.85, 159.82, 204.95, 253.91, 309.52, 369.5, 454.68, 536.81, 616.6, 680.18, 819.18, 961.18, 1046.18],
      vmag: [6.36, 4.62, 4.45, 4.47, 4.38, 4.25, 4.18, 3.97, 3.71, 3.34, 3.14, 3.0, 2.96, 3.15, 3.59, 4.04, 4.42, 4.7, 5.19, 5.68, 6.12, 6.68, 7.64, 8.7, 10.27, 11.48, 13.5, 15.01, 15.61],
      riseDays: 0.1,
      tailMagPerDay: 0.007,
      ...fromBv([2.6, 3.6, 6.5, 10.6, 21, 40, 61, 92, 131, 151, 252], [0.23, 0.4, 0.77, 1.16, 1.51, 1.61, 1.61, 1.59, 1.68, 1.65, 1.39]),
    },
    peakText: 'V = 2.98 at its peak on 19 May 1987, 84 days on (Hamuy & Suntzeff 1990)',
    seenForText: 'about ten months to the naked eye, until mid-December 1987',
    curveSources: [
      'Menzies et al. 1987, MNRAS 227, 39P; Catchpole et al. 1987, 1988, 1989; Suntzeff et al. 1988, AJ 96, 1864; Whitelock et al. 1988; Walker & Suntzeff 1991, PASP 103, 958 (V photometry, as compiled by the Open Supernova Catalog, Guillochon et al. 2017, ApJ 835, 64)',
    ],
    raDeg: 83.866617,
    decDeg: -69.269753,
    positionSource: 'SIMBAD (SN 1987A), 05h 35m 27.99s −69° 16′ 11.1″',
    distancePc: 49_590,
    distanceLoPc: 49_000,
    distanceHiPc: 51_400,
    distanceSource: 'the Large Magellanic Cloud’s, 49.59 kpc (Pietrzyński et al. 2019, Nature 567, 200), as the app places the Cloud; its ring’s light echo gives 51.4 ± 1.2 kpc (Panagia 1999)',
    photosphereKmS: 3_000,
    ejectaKmS: 30_000,
    ejectaSource: 'its fastest hydrogen at first about 30,000 km/s; the shock slowed to a few thousand km/s on meeting the gas round the star (Frank et al. 2016, ApJ 829, 40)',
    remnant: {
      name: 'SN 1987A’s ring',
      radiusArcsec: 0.825,
      epochYear: 2015.6,
      m: 0.3,
      source: 'the X-ray-bright shock’s radius, 0.664″ on day 5036 and 0.825″ on day 10433 (Frank et al. 2016); see the ring',
      bodyId: 'sn-1987a',
    },
    facts: [
      'The nearest supernova seen since Kepler’s, and the first whose star was known before it exploded: the blue supergiant Sanduleak −69 202.',
      'About two dozen neutrinos from its collapsing core were caught in Japan and the United States three hours before its light: the only neutrinos yet detected from a supernova.',
      'Its blast reached a ring of gas the star had shed 20,000 years before, lighting it up from 1995 onwards like a string of pearls.',
    ],
    factSources: ['https://ui.adsabs.harvard.edu/abs/1989ARA%26A..27..629A', 'https://doi.org/10.1103/PhysRevLett.58.1490', 'https://ui.adsabs.harvard.edu/abs/2016ApJ...829...40F'],
    factSourceLabels: ['Arnett et al. 1989', 'Hirata et al. 1987', 'Frank et al. 2016'],
  },
];

export const supernovaById = (id: string): Supernova | undefined => SUPERNOVAE.find((s) => s.id === id);

// ─── SN 1987A's ring and shock ────────────────────────────────────────────────────────

/**
 * SN 1987A's equatorial ring: angular radius 808 ± 17 mas (Panagia 1999's reanalysis), tilted 43° to the sky (Sugerman et
 * al. 2005), its long axis nearly east–west (position angle about 81°); which side is nearer to us is taken as the north.
 */
export const RING_1987A = { radiusArcsec: 0.808, inclinationDeg: 43, majorAxisPaDeg: 81 };

/**
 * SN 1987A's forward shock, ″ from the centre against days: very fast at first (about 30,000 km/s, Gaensler et al. 1997's
 * radio shell), slowed in the gas round the star by day ~1,500, then the X-ray radii of Frank et al. 2016 (0.664″ on day
 * 5036; meeting the ring around day 6047; 0.825″ on day 10433) and their slope since.
 */
export const SHOCK_1987A = { days: [0, 1500, 5036, 6047, 10433], arcsec: [0, 0.58, 0.664, 0.743, 0.825], tailArcsecPerDay: 1.9e-5 };

// ─── What it is like at a moment ──────────────────────────────────────────────────────

export interface SupernovaState {
  /** Apparent V magnitude from Earth (NONE when not shining). */
  vmag: number;
  /** Colour temperature of its light, K. */
  teffK: number;
  /** Days on its light curve. */
  days: number;
  /** Age since its light reached Earth, s (negative before). */
  ageS: number;
  /** Radius of the photosphere (the fireball) and of the forward shock (the debris's edge), km. */
  photosphereKm: number;
  shockKm: number;
}

/** Today's radius of the remnant, km. */
export const remnantRadiusKm = (sn: Supernova): number => sn.remnant.radiusArcsec * sn.distancePc * KM_PER_ARCSEC_PC;

/** The age of the remnant at its reference epoch, s. */
const refAgeS = (sn: Supernova): number => (msFromCivil(Math.floor(sn.remnant.epochYear), 1, 1) + (sn.remnant.epochYear % 1) * YEAR_MS - sn.explosionMs) / 1000;

/** Radius of the forward shock at age t (s), km: free expansion at the ejecta's speed, then R₀ (t/t₀)^m, whichever is smaller. */
export function shockRadiusKm(sn: Supernova, ageS: number): number {
  if (!(ageS > 0)) return 0;
  if (sn.id === 'supernova-1987a') {
    const pts = SHOCK_1987A;
    const d = ageS / 86_400;
    const n = pts.days.length;
    let a: number;
    if (d >= pts.days[n - 1]) a = pts.arcsec[n - 1] + (d - pts.days[n - 1]) * pts.tailArcsecPerDay;
    else {
      let i = 0;
      while (d > pts.days[i + 1]) i++;
      a = pts.arcsec[i] + ((d - pts.days[i]) / (pts.days[i + 1] - pts.days[i])) * (pts.arcsec[i + 1] - pts.arcsec[i]);
    }
    return Math.min(a * sn.distancePc * KM_PER_ARCSEC_PC, sn.ejectaKmS * ageS);
  }
  const free = sn.ejectaKmS * ageS;
  const law = remnantRadiusKm(sn) * (ageS / refAgeS(sn)) ** sn.remnant.m;
  return Math.min(free, law);
}

/** The shock's speed now, km/s (the derivative of shockRadiusKm, numerically). */
export function shockSpeedKmS(sn: Supernova, ageS: number): number {
  const h = Math.max(1, ageS * 1e-4);
  return (shockRadiusKm(sn, ageS + h) - shockRadiusKm(sn, Math.max(0, ageS - h))) / (ageS + h - Math.max(0, ageS - h));
}

/** The supernova at `ms` (the clock's time): its light as Earth sees it, and its debris. */
export function supernovaAt(sn: Supernova, ms: number, out?: SupernovaState): SupernovaState {
  const o = out ?? { vmag: NONE, teffK: 6000, days: 0, ageS: 0, photosphereKm: 0, shockKm: 0 };
  o.days = (ms - sn.zeroMs) / DAY_MS;
  o.ageS = (ms - sn.explosionMs) / 1000;
  o.vmag = magnitudeAt(sn.curve, o.days);
  o.teffK = temperatureAt(sn.curve, o.days);
  o.shockKm = shockRadiusKm(sn, o.ageS);
  o.photosphereKm = o.ageS > 0 ? Math.min(sn.photosphereKmS * o.ageS, o.shockKm) : 0;
  return o;
}

/** The last day of its naked-eye visibility (V ≤ 6), ms. */
export const nakedEyeEndMs = (sn: Supernova): number => sn.zeroMs + lastDayBrighterThan(sn.curve, 6) * DAY_MS;

/** The remnant's size relative to today's (its picture's), at a time: 0 before the explosion's light arrived. */
export function grownShare(sn: Supernova, ms: number): number {
  const age = (ms - sn.explosionMs) / 1000;
  if (!(age > 0)) return 0;
  return Math.min(1, shockRadiusKm(sn, age) / remnantRadiusKm(sn));
}
