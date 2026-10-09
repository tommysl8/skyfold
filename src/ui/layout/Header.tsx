/**
 * The header: the name (it opens About), the date chip, and on the right the ways in: "Where
 * to?" (the one amber button), Journeys, Learn and the View menu. Everything technical
 * (instruments, the physics reference, hints, layers, optics, and near a black hole its lens,
 * the accretion flow's model and whether its panel opens by itself) lives in the View menu,
 * which also starts Roam (F) and clean full screen (Shift+F), the ways to look around with
 * nothing in focus or nothing on screen.
 *
 * Labels give way to icons as the screen narrows, "Where to?" last. Widths were worked out
 * from the font metrics for 375 to 1920 px; see the notes by each breakpoint.
 */
import { useMemo, useState } from 'react';
import { Body, SearchRelativeLongitude } from 'astronomy-engine';
import { useShallow } from 'zustand/react/shallow';
import { EPOCH_MAX_MS, EPOCH_MIN_MS, resetToNow, setEpoch } from '../../sim/clock';
import { useUI } from '../../state/ui';
import { sim } from '../../sim/sim';
import { fixed, julianDate } from '../../lib/sci';
import { astroTimeAt, civilFromMs, formatSimDate, isDistantYear, msFromAstroTime } from '../../lib/time';
import { parseDateInput } from '../../lib/dateInput';
import { ephemerisQuality, qualityNote } from '../../sim/ephemeris';
import { openDoc, openLearn } from '../../state/route';
import { Check, Kbd, Menu, MenuHeading, Seg } from '../kit';
import { useTicker } from '../useTicker';
import { openJourneys, openReference, openSearch } from '../onboarding';
import { toggleRoam } from '../navigation';
import { enterClean } from '../cleanMode';
import { Icon } from '../icons';
import { constellationsShown, toggleConstellations } from '../constellations';
import { planetHostsShown, togglePlanetHosts } from '../planetHosts';
import { deepSkyChecked, toggleDeepSkyLayer } from '../deepSkyLayers';
import { cosmicWebShare, surveyShare, toggleCosmicWeb, toggleSurveys } from '../cosmicLayers';
import { starMotionNote } from '../../sim/stars/motion';
import { Wordmark } from '../Logo';
import { JOURNEYS } from '../../content/journeys';
import { countWord } from '../../lib/words';
import { DISK_TEXTS, FLOW_TEXTS } from '../../sim/blackholes/accretion';
import { LENSING_HINT } from '../deepSkyText';

export function OpticsSeg() {
  const relMode = useUI((s) => s.relMode);
  return (
    <Seg
      label="Optics model"
      value={relMode}
      onChange={(m) => useUI.setState({ relMode: m })}
      options={[
        { value: 'off', label: 'Classical', title: 'Classical (Galilean) optics: no aberration or Doppler shift from your motion; a black hole’s lens shows in both (Z)' },
        { value: 'on', label: 'Relativistic', title: 'Relativistic optics: aberration, Doppler shift and beaming, active above 0.01c; a black hole’s lens shows in both (Z)' },
        { value: 'split', label: 'Split', title: 'Split screen: classical left of the divider, relativistic right (X)' },
      ]}
    />
  );
}

/** The geomagnetic activity the aurora is drawn for (sim/phenomena/aurora.ts): Kp 1, 3, 5 or 7. */
function KpSeg() {
  const kp = useUI((s) => s.auroraKp);
  return (
    <Seg
      label="Geomagnetic activity (Kp)"
      value={String(kp)}
      onChange={(v) => useUI.setState({ auroraKp: Number(v), aurora: true })}
      options={[
        { value: '1', label: 'Quiet', title: 'Kp 1: a quiet night; the ovals are narrow and far north and south' },
        { value: '3', label: 'Kp 3', title: 'Kp 3: a typical moderate night (the default)' },
        { value: '5', label: 'Kp 5', title: 'Kp 5: a minor storm; the ovals widen towards the equator' },
        { value: '7', label: 'Kp 7', title: 'Kp 7: a strong storm; aurora overhead at 55° geomagnetic latitude' },
      ]}
    />
  );
}

function ScaleSeg() {
  const sizeMode = useUI((s) => s.sizeMode);
  return (
    <Seg
      label="Body scale"
      value={sizeMode}
      onChange={(m) => useUI.getState().setSizeMode(m)}
      options={[
        { value: 'true', label: 'True', title: 'Every body at its true size (T)' },
        { value: 'visible', label: 'Enlarged', title: 'Bodies drawn at least 8 px across; distances unchanged (T)' },
      ]}
    />
  );
}

// ─── The date chip ───────────────────────────────────────────────────────────────────────

/** "2026-09-24 14:03:27" (UTC); "-1999-03-12 00:00:00" before 1 CE. Read back by parseDateInput. */
const isoText = (ms: number) => formatSimDate(ms, 'input');

/** Next oppositions of the outer planets after the current date (where Astronomy Engine is precise). */
function nextOppositions(fromMs: number): { name: string; ms: number }[] {
  if (ephemerisQuality(fromMs) !== 'precise') return [];
  const t = astroTimeAt(fromMs);
  return (['Mars', 'Jupiter', 'Saturn'] as const)
    .map((b): { name: string; ms: number } | null => {
      try {
        return { name: b, ms: msFromAstroTime(SearchRelativeLongitude(Body[b], 0, t)) };
      } catch {
        return null;
      }
    })
    .filter((x): x is { name: string; ms: number } => !!x && x.ms <= EPOCH_MAX_MS)
    .sort((a, b) => a.ms - b.ms);
}

/** Buttons that load the next oppositions into the date field (worked out when the menu opens). */
function OppositionPresets({ onPick }: { onPick: (ms: number) => void }) {
  const list = useMemo(() => nextOppositions(sim.timeMs), []);
  if (!list.length) return null;
  return (
    <div className="mt-2">
      <div className="cap mb-1">Next oppositions</div>
      <div className="flex flex-wrap gap-1">
        {list.map((o) => (
          <button
            key={o.name}
            className="btn btn-sm"
            onClick={() => onPick(o.ms)}
            title={`${o.name} opposite the Sun as seen from Earth: ${isoText(o.ms)} UTC`}
          >
            {o.name} <span className="mono text-fg-3">{isoText(o.ms).slice(0, 10)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The date setter inside the chip's menu. */
function DateSetter() {
  const tripActive = useUI((s) => s.tripActive);
  const [text, setText] = useState(() => isoText(sim.timeMs));
  const ms = parseDateInput(text);
  const inRange = Number.isFinite(ms) && ms >= EPOCH_MIN_MS && ms <= EPOCH_MAX_MS;
  const apply = () => {
    if (inRange) setEpoch(ms);
  };
  return (
    <div className="px-2.5 pb-2 pt-1">
      <label className="cap mb-1.5 block" htmlFor="date-setter">
        Go to a date (UTC)
      </label>
      <input
        id="date-setter"
        className="fld w-full"
        value={text}
        placeholder="YYYY-MM-DD hh:mm:ss, or a year"
        spellCheck={false}
        aria-invalid={!inRange}
        aria-describedby="date-setter-help"
        onFocus={(e) => {
          setText(isoText(sim.timeMs));
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') apply();
        }}
      />
      <p id="date-setter-help" className="mt-1 text-[11px] leading-snug text-fg-3">
        A date and time such as 2026-09-25 14:00, or just a year: 1969, 500 BCE. Any year from 10,000 BCE to 9999.
      </p>
      {Number.isFinite(ms) && !inRange && <p className="mt-1 text-[11px] text-accent">Outside the years −9999 to 9999.</p>}
      {inRange && <p className="mt-1 text-[11px] leading-snug text-fg-2">{qualityNote(ms)}</p>}
      <OppositionPresets onPick={(t) => setText(isoText(t))} />
      <p className="mt-2 text-[11px] leading-snug text-fg-3">
        Every body moves to where it was (or will be) at once; spacecraft appear from their launch. Both clocks on
        the instrument panel restart from zero, and any light pulse in flight is dropped.
      </p>
      <div className="mt-2 flex items-center justify-end gap-1.5">
        <span className="mono mr-auto text-[10.5px] text-fg-3" title="Julian Date of the date shown now">
          JD {fixed(julianDate(sim.timeMs), 5, false)}
        </span>
        <button
          className="btn btn-sm"
          disabled={tripActive}
          onClick={() => {
            resetToNow();
            setText(isoText(sim.timeMs));
          }}
          title="Back to the present, in real time (N)"
        >
          Now
        </button>
        <button className="btn btn-pri btn-sm" disabled={tripActive || !inRange} onClick={apply}>
          Go to date
        </button>
      </div>
      {tripActive && <p className="mt-1.5 text-[11px] text-accent">Not in flight: time cannot be wound back on a trip.</p>}
    </div>
  );
}

/**
 * The date being shown. Amber, with a dot, whenever it is not the present (time paused, run
 * fast, or set, or a trip under way; Now brings it back); its tooltip says how exact the
 * planets' positions are at that date.
 */
function DateChip() {
  useTicker(4);
  const ms = sim.timeMs;
  // From the clock's own state, not from comparing dates: a live clock is the present however
  // the frames have run.
  const present = sim.live;
  const distant = isDistantYear(civilFromMs(ms).year);
  const date = formatSimDate(ms, 'date');
  const time = distant ? '' : formatSimDate(ms, 'time');
  const starNote = starMotionNote(ms);
  const title = `${formatSimDate(ms, 'long')}${present ? ', now' : ''}. ${qualityNote(ms)}${starNote ? ` ${starNote}` : ''} Click to change the date.`;
  return (
    <Menu
      tour="epoch"
      align="left"
      width={330}
      title={title}
      ariaLabel={`Date: ${formatSimDate(ms, 'long')}${present ? ', now' : ', not the present'}. Change the date`}
      buttonClassName={`btn btn-q ${present ? '' : '!border-accent/40 !bg-accent/[0.08] !text-accent'}`}
      label={
        <span className="mono flex items-center gap-1.5 whitespace-nowrap text-[12px] lg:text-[13.5px]">
          {!present && <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-accent" aria-hidden />}
          <span className={present ? 'text-fg' : ''}>{date}</span>
          {/* The time from 768 px, "UTC" from 1024 px (widths: see the file comment). */}
          {time && <span className={`max-md:hidden ${present ? 'text-fg' : ''}`}>{time}</span>}
          {time && <span className="text-fg-3 max-lg:hidden">UTC</span>}
        </span>
      }
    >
      <DateSetter />
    </Menu>
  );
}

// ─── The View menu ───────────────────────────────────────────────────────────────────────

/** Set once the View menu has been opened: its button's dot is then gone for good. */
const VIEW_SEEN_KEY = 'lightspeed.viewSeen';

function viewSeen(): boolean {
  try {
    return localStorage.getItem(VIEW_SEEN_KEY) === '1';
  } catch {
    return true;
  }
}

function ViewMenu() {
  const s = useUI(
    useShallow((u) => ({
      showOrbits: u.showOrbits,
      showLabels: u.showLabels,
      showBelts: u.showBelts,
      showOverlays: u.showOverlays,
      showGrid: u.showGrid,
      constellations: u.constellations,
      planetHosts: u.planetHosts,
      cosmicWeb: u.cosmicWeb,
      surveys: u.surveys,
      deepSky: u.deepSky,
      pulsars: u.pulsars,
      gwEvents: u.gwEvents,
      showCmb: u.showCmb,
      aurora: u.aurora,
      jets: u.jets,
      retarded: u.retarded,
      showFps: u.showFps,
      shortcuts: u.shortcuts,
      rightOpen: u.rightOpen,
      hints: u.hints,
      lensing: u.lensing,
      accretionFlow: u.accretionFlow,
      accretionDisks: u.accretionDisks,
      radioEyes: u.accretionBand === 'mm',
      holePanelAuto: u.holePanelAuto,
      notesHidden: u.hiddenNotes.length > 0,
      roaming: u.controlMode === 'roam' || u.controlMode === 'free',
    })),
  );
  const t = useUI.getState().toggle;
  // Until the menu has been opened once, a dot on its button says there is more here (saved: VIEW_SEEN_KEY).
  const [seen, setSeen] = useState(viewSeen);
  return (
    <Menu
      tour="view-menu"
      title="View: turn layers on and off (constellations, galaxy maps, pulsars…), optics, panels and help"
      ariaLabel="View"
      width={310}
      buttonClassName="btn view-btn"
      onOpen={() => {
        if (seen) return;
        setSeen(true);
        try {
          localStorage.setItem(VIEW_SEEN_KEY, '1');
        } catch {
          // storage blocked: the dot comes back next visit
        }
      }}
      label={
        <>
          <Icon name="sliders" size={14} />
          <span className="max-[899px]:hidden">View</span>
          {!seen && <span className="view-dot" aria-hidden="true" />}
        </>
      }
    >
      {(close) => (
        <>
          <div className="flex flex-col border-b border-line px-1 pb-1">
            {(
              [
                ['move', s.roaming ? 'Leave Roam' : 'Roam: fly anywhere', toggleRoam, 'F', 'The camera flown by hand, nothing in focus and no speed limit: WASD or the arrows move, a drag looks round'],
                ['fullscreen', 'Clean full screen', enterClean, 'Shift+F', 'The view alone, full screen, with no text; every control still works. Esc leaves'],
              ] as const
            ).map(([icon, label, run, key, title]) => (
              <button
                key={icon}
                className="btn btn-q btn-sm !h-7 !justify-start"
                title={title}
                onClick={() => {
                  close();
                  run();
                }}
              >
                <Icon name={icon} />
                {label}
                <span className="ml-auto">
                  <Kbd>{key}</Kbd>
                </span>
              </button>
            ))}
          </div>
          <MenuHeading>Panels</MenuHeading>
          <Check checked={s.rightOpen} onChange={() => t('rightOpen')} kbd="I" hint="Every number, live: speed, both clocks, Doppler factors, light-times, the selected body’s data">
            Instrument panel
          </Check>
          <Check checked={s.hints} onChange={() => t('hints')} hint="A note the first time something happens, such as passing 0.1c, with a link to read more">
            Physics hints
          </Check>
          <Check
            checked={s.holePanelAuto}
            onChange={() => t('holePanelAuto')}
            hint="Near a black hole, its panel of clocks, height, thrust and tides opens by itself. Off, a small chip offers it; a black-hole scene or a fall still opens it"
          >
            Open the black-hole panel automatically
          </Check>
          <Check
            checked={!s.notesHidden}
            onChange={(v) => useUI.setState({ hiddenNotes: v ? [] : ['cmb', 'web', 'surveys', 'flow', 'belts', 'nsc'] })}
            hint="The short notes on the data layers (the cosmic web, the galaxy surveys…) in the top left. Hide on a note puts that note away; this brings them all back"
          >
            Layer notes
          </Check>
          <MenuHeading>Scene</MenuHeading>
          <Check checked={s.showOrbits} onChange={() => t('showOrbits')} kbd="O">
            Orbits
          </Check>
          <Check checked={s.showLabels} onChange={() => t('showLabels')} kbd="L">
            Labels
          </Check>
          <Check checked={s.showBelts} onChange={() => t('showBelts')} kbd="B" hint="The named asteroids, the large ones and every comet (JPL SBDB), with a sample of the rest">
            Small bodies
          </Check>
          <Check checked={s.showGrid} onChange={() => t('showGrid')} kbd="J">
            Ecliptic grid
          </Check>
          <Check
            checked={constellationsShown(s.constellations, sim.camera.pos.length())}
            onChange={toggleConstellations}
            kbd="Y"
            hint={
              s.constellations === 'auto'
                ? 'The 88 figures, drawn between the real stars. On by themselves once you are among the stars'
                : 'The 88 figures, drawn between the real stars: fly away and they come apart'
            }
          >
            Constellations
          </Check>
          <Check
            checked={planetHostsShown(s.planetHosts, sim.camera.pos.length())}
            onChange={togglePlanetHosts}
            hint={
              s.planetHosts === 'auto'
                ? 'A ring around each star with known planets, within 40 parsecs. On by themselves once you are among the stars'
                : 'A ring around each star with known planets, within 40 parsecs'
            }
          >
            Planet hosts
          </Check>
          <Check
            checked={cosmicWebShare(s.cosmicWeb, sim.camera.pos.length()) > 0}
            onChange={toggleCosmicWeb}
            hint={
              s.cosmicWeb === 'auto'
                ? '55,877 galaxies with measured distances, as a map (Cosmicflows-4). On by itself beyond the Local Group'
                : '55,877 galaxies with measured distances, as a map (Cosmicflows-4)'
            }
          >
            Cosmic web
          </Check>
          <Check
            checked={surveyShare(s.surveys, sim.camera.pos.length()) > 0}
            onChange={toggleSurveys}
            hint={
              s.surveys === 'auto'
                ? '13.5 million galaxies and quasars from DESI and the SDSS, as a map placed by redshift. On by itself beyond 30 megaparsecs'
                : '13.5 million galaxies and quasars from DESI and the SDSS, as a map placed by redshift'
            }
          >
            Galaxy surveys
          </Check>
          <Check
            checked={deepSkyChecked('deepSky', s.deepSky, sim.camera.pos.length())}
            onChange={() => toggleDeepSkyLayer('deepSky')}
            hint={
              s.deepSky === 'auto'
                ? 'Faint rings round the NGC and IC galaxies, clusters and nebulae with measured distances, and the supernova remnants. On by themselves among the stars and beyond the Galaxy'
                : 'Faint rings round the NGC and IC galaxies, clusters and nebulae with measured distances, and the supernova remnants'
            }
          >
            Deep-sky objects
          </Check>
          <Check
            checked={deepSkyChecked('pulsars', s.pulsars, sim.camera.pos.length())}
            onChange={() => toggleDeepSkyLayer('pulsars')}
            hint={
              s.pulsars === 'auto'
                ? '4,179 pulsars of the ATNF catalogue, each beating with its spin (slowed when too fast to watch). On by themselves among the stars'
                : '4,179 pulsars of the ATNF catalogue, each beating with its spin (slowed when too fast to watch)'
            }
          >
            Pulsars
          </Check>
          <Check
            checked={deepSkyChecked('gwEvents', s.gwEvents, sim.camera.pos.length())}
            onChange={() => toggleDeepSkyLayer('gwEvents')}
            hint={
              s.gwEvents === 'auto'
                ? 'Mergers of black holes and neutron stars heard in gravitational waves, each a soft region where it probably happened. On by themselves beyond the Galaxy'
                : 'Mergers of black holes and neutron stars heard in gravitational waves, each a soft region where it probably happened'
            }
          >
            Gravitational-wave events
          </Check>
          <Check checked={s.showCmb} onChange={() => t('showCmb')} hint="The cosmic microwave background over the sky: WMAP’s map, contrast enhanced about 10,000 times">
            CMB map
          </Check>
          <Check
            checked={s.aurora}
            onChange={() => t('aurora')}
            hint="Earth’s auroral ovals on the night side: green oxygen light at 100–150 km, red above it, round the geomagnetic poles of the date. The curtains are a model; the ovals follow a published model for the activity chosen below"
          >
            Aurora
          </Check>
          {s.aurora && (
            <div className="px-2.5 pb-1 pt-1">
              <KpSeg />
            </div>
          )}
          <Check
            checked={s.jets}
            onChange={() => t('jets')}
            hint="The jets of M87 and Centaurus A, beamed by their measured speeds: the side coming towards us brightened, the other faint"
          >
            Relativistic jets
          </Check>
          <Check checked={s.showOverlays} onChange={() => t('showOverlays')} kbd="U" hint="Scale bar and camera readout; in flight the reticle and apex markers">
            Readouts over the view
          </Check>
          <Check checked={s.retarded} onChange={() => t('retarded')} hint="Each body where it was when the light now arriving left it">
            Light-time correction
          </Check>
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2 px-2.5 pb-1 pt-2">
            <div>
              <div className="cap mb-1">Body size</div>
              <ScaleSeg />
            </div>
            <div>
              <div className="cap mb-1">Optics</div>
              <OpticsSeg />
            </div>
          </div>
          <p className="px-2.5 pb-1 text-[11px] leading-snug text-fg-3">Relativistic optics show above 0.01c, so in flight. Near a black hole its lens shows at rest too.</p>
          {/* Neither switch is saved between visits (state/ui.ts savedPrefs): lensing off would hide every black hole next time. */}
          <Check checked={s.lensing} onChange={() => t('lensing')} hint={LENSING_HINT}>
            Gravitational lensing
          </Check>
          <Check checked={s.accretionFlow} onChange={() => t('accretionFlow')} hint={FLOW_TEXTS.menuHint}>
            Accretion flow
          </Check>
          {/* The flow's 1.3 mm view, also on Sgr A*'s card; turning it on brings the flow back if it was off. */}
          <Check
            checked={s.radioEyes}
            onChange={(v) => useUI.setState(v ? { accretionBand: 'mm', accretionFlow: true } : { accretionBand: 'visible', ehtBlur: false })}
            hint={FLOW_TEXTS.radioHint}
          >
            {FLOW_TEXTS.radio}
          </Check>
          <Check checked={s.accretionDisks} onChange={() => t('accretionDisks')} hint={DISK_TEXTS.menuHint}>
            {DISK_TEXTS.menu}
          </Check>
          <MenuHeading>Options</MenuHeading>
          <Check checked={s.showFps} onChange={() => t('showFps')}>
            Performance readout
          </Check>
          <Check checked={s.shortcuts} onChange={() => t('shortcuts')} hint="Space, R, 0–9 and the rest. Turn off if they clash with assistive software.">
            Single-key shortcuts
          </Check>
          <div className="mt-1 flex flex-col border-t border-line px-1 pt-1">
            {(
              [
                ['book', 'Guide', () => openDoc('guide'), null],
                ['dock-left', 'Physics reference', openReference, null],
                ['keyboard', 'Keyboard and mouse', () => useUI.setState({ keysOpen: true }), '?'],
                ['info', 'About Skyfold', () => openDoc('about'), null],
              ] as const
            ).map(([icon, label, run, key]) => (
              <button
                key={label}
                className="btn btn-q btn-sm !h-7 !justify-start"
                onClick={() => {
                  close();
                  run();
                }}
              >
                <Icon name={icon} />
                {label}
                {key && (
                  <span className="ml-auto">
                    <Kbd>{key}</Kbd>
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </Menu>
  );
}

// ─── The header ──────────────────────────────────────────────────────────────────────────

/*
 * Widths, from IBM Plex Sans and JetBrains Mono metrics (12 px type below 1024 px, 13.5 px
 * from 1024), buttons 8–12 px padded:
 *   375 px   mark, date, then icons: search, Journeys, Learn, About, View. About 350 px.
 *   480 px   "Where to?" gets its label (+64 px).
 *   640 px   the name SKYFOLD (+104). About 505 px.
 *   768 px   the time on the chip (+64), "Journeys" (+57). About 665 px.
 *   900 px   "Learn", "About" and "View" in words (+118). About 815 px.
 *   1024 px  larger type, "UTC" on the chip. About 850 px.
 *   1280 px  the "/" key on the search button.
 *   1760 px  the tagline beside the name.
 */
export function Header() {
  return (
    <header className="app-hdr flex min-w-0 items-center gap-2 border-b border-line-2 bg-panel px-3 lg:gap-3">
      <a
        href="#/about"
        className="-mx-1 flex h-[30px] shrink-0 items-center rounded-[2px] px-1 hover:bg-hover focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent lg:h-9"
        title="About Skyfold"
        onClick={(e) => {
          e.preventDefault();
          openDoc('about');
        }}
      >
        <Wordmark size={18} large subtitle nameBelowSm={false} />
      </a>

      <div className="mx-1 h-4 w-px shrink-0 bg-line-2 max-sm:hidden" />
      <DateChip />

      <div className="ml-auto flex min-w-0 items-center gap-1 sm:gap-1.5">
        <button
          className="btn btn-pri"
          data-tour="search"
          onClick={openSearch}
          title="Where to? Find a planet, a star or a galaxy and go there (/ or Ctrl+K)"
          aria-label="Where to?"
        >
          <Icon name="search" size={14} />
          <span className="max-[479px]:hidden">Where to?</span>
          <span className="rounded-[2px] border border-black/25 px-1 font-mono text-[11px] leading-[16px] opacity-70 max-xl:hidden" aria-hidden>
            /
          </span>
        </button>
        <button
          className="btn btn-q"
          data-tour="journeys"
          onClick={openJourneys}
          title={`Journeys: ${countWord(JOURNEYS.length)} one-click trips and scenes, each with what to look for`}
          aria-label="Journeys"
        >
          <Icon name="compass" size={14} className="text-accent" />
          <span className="max-md:hidden">Journeys</span>
        </button>
        <button className="btn btn-q" data-tour="learn" onClick={() => openLearn()} title="Learn: long reads on the science behind the view (E)" aria-label="Learn">
          <Icon name="book" size={14} />
          <span className="max-[899px]:hidden">Learn</span>
        </button>
        <button className="btn btn-q" onClick={() => openDoc('about')} title="About Skyfold: what it is, who made it, its sources and how to cite it" aria-label="About">
          <Icon name="info" size={14} />
          <span className="max-[899px]:hidden">About</span>
        </button>
        <div className="mx-0.5 h-4 w-px shrink-0 bg-line-2 max-sm:hidden" />
        <ViewMenu />
      </div>
    </header>
  );
}
