/**
 * A place as data (state/place.ts): its link written and read back, to the figures kept; the date ("now", ISO 8601,
 * ms beyond the year 9999), the pace and the pause; malformed and out-of-range values dropped field by field; the
 * throttle that saves it; the saved list kept in shape; and when the last place is offered again.
 */
import { describe, expect, it } from 'vitest';
import { msFromCivil } from '../lib/time';
import { TIME_MAX_MS, TIME_MIN_MS } from '../sim/clock';
import {
  addSaved,
  createThrottle,
  dateLabel,
  decodePlace,
  encodePlace,
  hasPlaceLink,
  isDefaultStart,
  MAX_SAVED,
  offerResume,
  parseLastPlace,
  parseSavedPlaces,
  parseTime,
  PLACE_TIME_MAX_MS,
  PLACE_TIME_MIN_MS,
  removeSaved,
  renameSaved,
  samePlace,
  timeText,
  withoutPlace,
  type Place,
  type SavedPlace,
} from './place';

const T = msFromCivil(2031, 3, 3, 12);
const dirOf = (x: number, y: number, z: number) => {
  const l = Math.hypot(x, y, z);
  return { x: x / l, y: y / l, z: z / l };
};
const rel = (a: number, b: number) => Math.abs(a / b - 1);

describe('a place as a link', () => {
  it('reads as the example: short, with the date in ISO 8601 and the pace and pause', () => {
    const q = encodePlace({ at: 'betelgeuse', r: 4_509_234_567.89, dir: dirOf(1, 2, 2), t: T, w: 1000, p: true, sel: 'betelgeuse' });
    expect(q).toBe('at=betelgeuse&r=4.50923e9&dir=0.333333,0.666667,0.666667&t=2031-03-03T12:00:00Z&w=1000&p=1&sel=betelgeuse');
  });

  it('leaves out what is the default: now, real time, running, no direction, no distance', () => {
    expect(encodePlace({ at: 'earth', t: 'now', w: 1, p: false })).toBe('at=earth');
    expect(decodePlace('?at=earth')).toEqual({ at: 'earth', t: 'now', w: 1, p: false });
  });

  it('comes back for a planet to 6 significant figures, and its direction to 10⁻⁶', () => {
    const p: Place = { at: 'saturn', r: 812_345.678, dir: dirOf(-0.3, 0.2, 0.9), t: T, w: 1, p: false, sel: 'titan' };
    const back = decodePlace(encodePlace(p))!;
    expect(back.at).toBe('saturn');
    expect(rel(back.r!, p.r!)).toBeLessThan(5e-6);
    expect(Math.hypot(back.dir!.x - p.dir!.x, back.dir!.y - p.dir!.y, back.dir!.z - p.dir!.z)).toBeLessThan(2e-6);
    expect(Math.hypot(back.dir!.x, back.dir!.y, back.dir!.z)).toBeCloseTo(1, 12);
    expect(back.t).toBe(T);
    expect(back.sel).toBe('titan');
    // Written again, the same link.
    expect(samePlace(back, p)).toBe(true);
  });

  it('keeps a far galaxy’s offset, however far the galaxy: 300 km from a body 40 Mpc out comes back as 300 km', () => {
    const p: Place = { at: 'ngc-4993', r: 300.000123, dir: dirOf(0, 0, 1), t: T, w: 1, p: false };
    expect(decodePlace(encodePlace(p))!.r).toBe(300);
    const m51: Place = { at: 'whirlpool', r: 3.08567758e19, t: 'now', w: 1, p: false };
    expect(rel(decodePlace(encodePlace(m51))!.r!, m51.r!)).toBeLessThan(5e-6);
  });

  it('keeps a black hole’s height to 12 significant figures: a hover just above the floor comes back as it was', () => {
    // Sgr A*: r_s = 1.2 × 10⁷ km, the floor r_s·10⁻⁶ = 12.7 km; a hover 0.1 % above the floor.
    const rs = 12_717_458.83;
    const h = rs * 1e-6 * 1.001;
    const p: Place = { at: 'sgr-a-star', h, dir: dirOf(1, 0.2, -0.4), t: T, w: 1, p: true };
    const q = encodePlace(p);
    expect(q).toContain('h=12.7301762888&');
    const back = decodePlace(q)!;
    expect(rel(back.h!, h)).toBeLessThan(5e-12);
    expect(back.r).toBeUndefined();
    // At the floor itself.
    const floor = rs * 1e-6;
    expect(rel(decodePlace(encodePlace({ ...p, h: floor }))!.h!, floor)).toBeLessThan(5e-12);
  });
});

describe('the date, the pace and the pause', () => {
  it('writes "now" as nothing, and a fixed date as ISO 8601, with milliseconds only when there are any', () => {
    expect(encodePlace({ at: 'mars', t: 'now', w: 1, p: false })).not.toMatch(/(^|&)t=/);
    expect(timeText(T)).toBe('2031-03-03T12:00:00Z');
    expect(timeText(T + 250)).toBe('2031-03-03T12:00:00.250Z');
    expect(parseTime('2031-03-03T12:00:00.250Z')).toBe(T + 250);
    expect(parseTime('2031-03-03')).toBe(msFromCivil(2031, 3, 3));
    expect(decodePlace('at=mars&t=now')!.t).toBe('now');
  });

  it('a fixed time against "now": the same instant written either way is not the same place', () => {
    const now: Place = { at: 'mars', t: 'now', w: 1, p: false };
    const fixed: Place = { ...now, t: Date.now() };
    expect(samePlace(now, fixed)).toBe(false);
    expect(isDefaultStart({ at: 'earth', r: 26_000, t: 'now', w: 1, p: false })).toBe(true);
    expect(isDefaultStart({ at: 'earth', r: 26_000, t: T, w: 1, p: false })).toBe(false);
  });

  it('writes dates beyond the years 0 to 9999 in ms (a long trip carries the clock there), within the clock’s range', () => {
    const far = msFromCivil(2_500_000, 6, 1);
    const q = encodePlace({ at: 'andromeda', t: far, w: 1, p: false });
    expect(q).toMatch(/t=\d+e?\d*/);
    expect(decodePlace(q)!.t).toBe(Math.round(far));
    const bce = msFromCivil(-500, 1, 1);
    expect(decodePlace(encodePlace({ at: 'sun', t: bce, w: 1, p: false }))!.t).toBe(bce);
    expect(PLACE_TIME_MIN_MS).toBe(TIME_MIN_MS);
    expect(PLACE_TIME_MAX_MS).toBe(TIME_MAX_MS);
  });

  it('keeps the pace and the pause', () => {
    const back = decodePlace(encodePlace({ at: 'jupiter', t: T, w: 1e6, p: true }))!;
    expect(back.w).toBe(1e6);
    expect(back.p).toBe(true);
    expect(decodePlace(encodePlace({ at: 'jupiter', t: T, w: 123_456.789, p: false }))!.w).toBe(123_457);
    expect(decodePlace('at=jupiter&w=1e16')!.w).toBe(1e16);
  });
});

describe('malformed links', () => {
  it('make no place without a well-formed body id', () => {
    for (const q of ['', '?', 'r=100', 'at=', 'at=%20', 'at=<script>', `at=${'x'.repeat(200)}`, 'at=../etc', 'at=a%26b']) expect(decodePlace(q), q).toBeNull();
  });

  it('drop each bad field and keep the rest: the defaults stand in', () => {
    const p = decodePlace('at=mars&r=-5&dir=1,2&t=2031-13-01T00:00:00Z&w=0&p=yes&sel=<b>')!;
    expect(p).toEqual({ at: 'mars', t: 'now', w: 1, p: false });
    expect(decodePlace('at=mars&r=1e30')!.r).toBeUndefined();
    expect(decodePlace('at=mars&r=NaN')!.r).toBeUndefined();
    expect(decodePlace('at=mars&r=Infinity')!.r).toBeUndefined();
    expect(decodePlace('at=mars&dir=0,0,0')!.dir).toBeUndefined();
    expect(decodePlace('at=mars&dir=3,0,0')!.dir).toBeUndefined();
    expect(decodePlace('at=mars&dir=a,b,c')!.dir).toBeUndefined();
    expect(decodePlace('at=mars&t=2031-02-30')!.t).toBe('now');
    expect(decodePlace('at=mars&t=1e40')!.t).toBe('now');
    expect(decodePlace('at=mars&w=1e20')!.w).toBe(1);
    expect(decodePlace('at=mars&w=-100')!.w).toBe(1);
    expect(decodePlace('at=mars&h=0')!.h).toBeUndefined();
  });

  it('take an id the app may not know: renamed ids are not an error here', () => {
    expect(decodePlace('at=no-such-body-v9')!.at).toBe('no-such-body-v9');
  });

  it('are recognised as links, and their keys alone are taken out of the address', () => {
    expect(hasPlaceLink('?at=mars&r=5')).toBe(true);
    expect(hasPlaceLink('?at=')).toBe(true);
    expect(hasPlaceLink('?utm=x')).toBe(false);
    expect(withoutPlace('?at=mars&r=5&dir=1,0,0&t=now&w=10&p=1&sel=mars')).toBe('');
    expect(withoutPlace('?ref=x&at=mars')).toBe('?ref=x');
  });
});

describe('saving', () => {
  it('writes at most every 2 s while the view changes, and at once when the page goes away', () => {
    const th = createThrottle(2000);
    th.seed('a');
    expect(th.offer('a', 0)).toBe(false); // nothing new
    expect(th.offer('b', 0)).toBe(true);
    expect(th.offer('c', 500)).toBe(false); // too soon
    expect(th.offer('c', 1999)).toBe(false);
    expect(th.offer('c', 2000)).toBe(true);
    expect(th.offer('c', 9000)).toBe(false); // unchanged
    expect(th.offer('d', 9100)).toBe(true);
    expect(th.flush('e', 9200)).toBe(true); // the page is going: no wait
    expect(th.flush('e', 9300)).toBe(false);
  });

  it('keeps the saved list in shape: newest first, at most 50, names cleaned, bad entries left out', () => {
    const entry = (i: number): SavedPlace => ({ id: `p${i}`, q: `at=mars&r=${1000 + i}`, name: 'Mars', savedAt: i, label: `Mars ${i}` });
    let list: SavedPlace[] = [];
    for (let i = 0; i < 60; i++) list = addSaved(list, entry(i));
    expect(list).toHaveLength(MAX_SAVED);
    expect(list[0].id).toBe('p59');
    list = renameSaved(list, 'p59', '   Olympus   Mons  ');
    expect(list[0].label).toBe('Olympus Mons');
    expect(renameSaved(list, 'p59', '   ')[0].label).toBe('Olympus Mons');
    expect(removeSaved(list, 'p59')[0].id).toBe('p58');
    const parsed = parseSavedPlaces([entry(1), { ...entry(2), q: 'at=' }, { id: 3 }, entry(1), null, 'x', { ...entry(4), label: '' }]);
    expect(parsed.map((s) => s.id)).toEqual(['p1', 'p4']);
    expect(parsed[1].label).toBe('Mars');
    expect(parseSavedPlaces('nope')).toEqual([]);
  });
});

describe('the offer to pick up where you left off', () => {
  const last = (q: string) => parseLastPlace({ q, name: 'Betelgeuse', savedAt: 1 });

  it('is made to a returning visitor whose last place is somewhere else', () => {
    expect(offerResume(last('at=betelgeuse&t=2031-03-03T12:00:00Z'), { link: false, welcome: false })).toBe(true);
  });

  it('is not made with a link, on a first visit (the welcome screen), with nothing saved, or for the opening view', () => {
    const l = last('at=betelgeuse');
    expect(offerResume(l, { link: true, welcome: false })).toBe(false);
    expect(offerResume(l, { link: false, welcome: true })).toBe(false);
    expect(offerResume(null, { link: false, welcome: false })).toBe(false);
    expect(offerResume(last('at=earth&r=26000&dir=0.1,0.2,0.974679'), { link: false, welcome: false })).toBe(false);
    // Paused at the opening view is a place of its own.
    expect(offerResume(last('at=earth&r=26000&p=1'), { link: false, welcome: false })).toBe(true);
  });

  it('reads back only a well-formed last place', () => {
    expect(parseLastPlace({ q: 'at=', name: 'x', savedAt: 1 })).toBeNull();
    expect(parseLastPlace('at=mars')).toBeNull();
    expect(parseLastPlace(null)).toBeNull();
    expect(parseLastPlace({ q: 'at=mars' })).toEqual({ q: 'at=mars', name: '', savedAt: 0 });
  });

  it('names the date as the prompt and the saved places do', () => {
    expect(dateLabel(T, true)).toBe('3 March 2031');
    expect(dateLabel(T)).toBe('3 Mar 2031');
    expect(dateLabel(msFromCivil(-499, 7, 1))).toBe('1 Jul 500 BCE');
    expect(dateLabel(msFromCivil(2_500_000, 1, 1))).toBe('year 2.5 million');
  });
});
