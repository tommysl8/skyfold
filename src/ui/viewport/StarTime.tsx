/**
 * Stars in time, on their cards (docs/data/stars.md §14–15):
 *  - the Sun's: its age and stage of life, a slider over its whole life (the Sun's own age, not the clock's: the planets
 *    stay at today's date, their orbits widened as it loses mass), "Today" to bring it back, "Watch" for the journey;
 *  - a star with a measured mass: a small HR diagram, the track of a star of its mass (Hurley, Pols & Tout 2000) and
 *    the star on it;
 *  - a variable star: how it varies, and its light from Earth now.
 * The tracks are worked out from the formulae the first time one of these cards opens (a few milliseconds each).
 *
 * Cost: the card's own re-render; the sparkline's track is worked out once per star.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { StarInfo } from '../../sim/bodies';
import { SUN_AGE_TODAY_YR, sunAt, trackForMass, TRACK_MASS_RANGE, type SunState, type Track } from '../../sim/stars/evolution';
import { ageAtLife, lifeOfAge, loadTracks, setSunAge, subscribeSunFuture, sunAgeLine, sunFuture, sunFutureVersion, sunSwallowedLine } from '../../sim/stars/sunFuture';
import { variableNow } from '../../sim/stars/variability';
import { starColour } from '../../sim/stars/records';
import { runScene } from '../../content/scenes';

const useSunFuture = () => useSyncExternalStore(subscribeSunFuture, sunFutureVersion);

// ─── The HR diagram ──────────────────────────────────────────────────────────────────────

const W = 112;
const H = 58;
/** log T from 50,000 K (left) to 2,500 K (right); log L from 10⁻⁴ to 10⁶ L☉. */
const X = (logT: number) => ((4.7 - Math.min(4.7, Math.max(3.4, logT))) / 1.3) * (W - 4) + 2;
const Y = (logL: number) => H - 2 - ((Math.min(6, Math.max(-4, logL)) + 4) / 10) * (H - 4);

function trackPath(t: Track, tail?: { logT: number; logL: number }[]): string {
  const pts: string[] = [];
  for (let i = 0; i < t.eep.length; i++) pts.push(`${X(t.logT[i]).toFixed(1)},${Y(t.logL[i]).toFixed(1)}`);
  for (const p of tail ?? []) pts.push(`${X(p.logT).toFixed(1)},${Y(p.logL).toFixed(1)}`);
  return `M${pts.join('L')}`;
}

/** A small HR diagram: the track of a star of this mass, and the star where it is now. */
function HrSpark({ track, logT, logL, colour, label, tail }: { track: Track; logT: number; logL: number; colour: string; label: string; tail?: { logT: number; logL: number }[] }) {
  const d = useMemo(() => trackPath(track, tail), [track, tail]);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 text-fg-4" role="img" aria-label={label}>
      <title>{label}</title>
      <rect x="0.5" y="0.5" width={W - 1} height={H - 1} fill="none" stroke="currentColor" strokeWidth="0.5" opacity="0.6" />
      <path d={d} fill="none" stroke="var(--color-fg-3)" strokeWidth="0.9" strokeLinejoin="round" opacity="0.8" />
      <circle cx={X(logT)} cy={Y(logL)} r="2.6" fill={colour} stroke="var(--color-bg)" strokeWidth="0.6" />
    </svg>
  );
}

/** The track of a star with a measured mass, with the star on it (its measured temperature and luminosity). */
export function StarTrack({ star }: { star: StarInfo }) {
  const mass = star.massMsun;
  const track = useMemo(() => (mass ? trackForMass(mass) : null), [mass]);
  if (!track || !mass || !star.luminosityLsun) return null;
  const inRange = mass >= TRACK_MASS_RANGE[0] && mass <= TRACK_MASS_RANGE[1];
  return (
    <div className="mt-1 flex items-center gap-2">
      <HrSpark
        track={track}
        logT={Math.log10(star.teffK)}
        logL={Math.log10(star.luminosityLsun)}
        colour={starColour(star.teffK)}
        label={`Hertzsprung–Russell diagram: the life of a ${mass.toPrecision(2)} solar-mass star (Hurley, Pols & Tout 2000), and this star on it`}
      />
      <p className="text-[10.5px] leading-snug text-fg-3">
        The life of a star of {inRange ? mass.toPrecision(2) : track.massMsun} solar masses{inRange ? '' : ' (the nearest the formulae are drawn for)'}, hot on the left, bright at the top; the dot is this
        star (Hurley, Pols & Tout’s formulae, solar metallicity).
      </p>
    </div>
  );
}

// ─── The Sun ─────────────────────────────────────────────────────────────────────────────

/** The Sun's age: its stage of life, the planets it has swallowed, a slider over its life, Today, and the journey. */
export function SunAge() {
  useSunFuture();
  const m = sunFuture.model;
  useEffect(() => {
    if (!m) void loadTracks();
  }, [m]);
  const age = sunFuture.ageYr;
  const s = sunFuture.state;
  const swallowed = sunSwallowedLine();
  // The Sun's numbers are today's nominal ones; the track's are the formulae's own (a shade fainter and cooler): put back on it.
  const onTrack = (x: SunState) => ({ logT: Math.log10(x.teffK) + (m ? m.today.logTeff - Math.log10(5772) : 0), logL: Math.log10(x.lsun) + (m ? m.today.logL : 0) });
  // The white dwarf's cooling after the track (the model), for the diagram.
  const tail = useMemo(() => (m ? [0.91, 0.94, 0.97, 1].map((p) => onTrack(sunAt(m, ageAtLife(m, p)))) : undefined), [m]);
  const dot = onTrack(s ?? (m ? sunAt(m, SUN_AGE_TODAY_YR) : ({ teffK: 5772, lsun: 1 } as SunState)));
  return (
    <div className="mt-1.5">
      <div className="text-[11px] leading-snug text-fg-2">{sunAgeLine()}</div>
      {swallowed && <div className="mt-0.5 text-[11px] leading-snug text-fg-3">{swallowed}</div>}
      {m && (
        <div className="mt-1 flex items-center gap-2">
          <HrSpark
            track={m.track}
            logT={dot.logT}
            logL={dot.logL}
            tail={tail}
            colour={starColour(s ? s.teffK : 5772)}
            label="Hertzsprung–Russell diagram: the Sun’s life (Hurley, Pols & Tout 2000), and the Sun at the age shown"
          />
          <div className="min-w-0 flex-1">
            <input
              type="range"
              min={0}
              max={1000}
              step={1}
              value={Math.round(1000 * (age === null ? 0 : lifeOfAge(m, age)))}
              onChange={(e) => setSunAge(ageAtLife(m, Number(e.target.value) / 1000))}
              className="w-full accent-[var(--color-fg-3)]"
              aria-label="The Sun’s age, from today to a cooling white dwarf"
              title="The Sun’s own age (the date stays): from today to a white dwarf"
            />
            <div className="mt-0.5 flex gap-1">
              <button className="btn btn-q btn-sm !h-5 !px-1.5" disabled={age === null} onClick={() => setSunAge(null)} title="The Sun as it is today">
                Today
              </button>
              <button className="btn btn-q btn-sm !h-5 !px-1.5" onClick={() => runScene('sun-future')} title="The journey: the Sun’s whole life in a minute and a half">
                Watch its future
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Variables ───────────────────────────────────────────────────────────────────────────

/** A variable star's line: how it varies, and its light from Earth at the date. */
export function VariableLine({ id, line }: { id: string; line: string }) {
  const now = variableNow(id);
  return (
    <div className="mt-0.5 text-[11px] leading-snug text-fg-2">
      {line}
      {now && <span className="text-fg-3"> {now}</span>}
    </div>
  );
}
