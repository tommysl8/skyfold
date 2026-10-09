/**
 * The Skyfold guide: how to explore, fly and find your way around. British spelling, SI
 * units, symbols in italics (ital() for plain strings). Everything here describes the interface as the code builds it: when a control
 * moves, this file moves with it.
 */
import type { ReactNode } from 'react';
import type { BodyId } from '../../sim/bodies';
import { setPaused, setWarp, WARP_STEPS } from '../../sim/clock';
import { TRIP_PLAYBACK_S } from '../../sim/travel';
import { notice } from '../notices';
import { JOURNEYS } from '../../content/journeys';
import { FEATURED_IDS, findDestination } from '../../content/destinations';
import { findArticle, useArticles } from '../../content/learn/library';
import { formatDurationShort } from '../../lib/time';
import { superscript } from '../../lib/sci';
import { countWord, countWordStart } from '../../lib/words';
import { openLearn } from '../../state/route';
import { useUI } from '../../state/ui';
import { frameSolarSystem, goToBody, startRoam } from '../navigation';
import { enterClean } from '../cleanMode';
import { ROAM_BOOST, ROAM_RATE } from '../../controls/roamScale';
import { rateWords } from '../flight/roamText';
import { runScene } from '../../content/scenes';
import { openJourneys, openReference, openSearch, resetPreferences, showWelcome, startTour } from '../onboarding';
import { KEY_GROUPS } from '../keys';
import { Kbd } from '../kit';
import { rich } from '../rich';
import { GuideFlightsBeyond } from './GuideFlightsBeyond';
import { AberrationFigure, ScreenMap } from './figures';
import { Callout, Chapter, Fig, H3, KeyTable, Lamp, Note, Ref, Steps, Try, type TocEntry } from './parts';

export const GUIDE_TOC: TocEntry[] = [
  { id: 'welcome', title: 'Welcome' },
  { id: 'quick-start', title: 'Quick start' },
  { id: 'screen', title: 'The screen' },
  { id: 'looking', title: 'Looking around' },
  { id: 'universe', title: 'What is out there' },
  { id: 'time', title: 'Time' },
  { id: 'flying', title: 'Journeys and flights' },
  { id: 'seeing', title: 'What you are seeing' },
  { id: 'readings', title: 'Readings' },
  { id: 'controls', title: 'Keyboard and mouse' },
  { id: 'troubleshooting', title: 'Troubleshooting' },
  { id: 'glossary', title: 'Glossary' },
];

/** A chapter's number, from its place in the contents. */
const chapterNo = (id: string): number => GUIDE_TOC.findIndex((c) => c.id === id) + 1;

/** A cross-reference to a chapter by its number ("Chapter 7"), which follows the contents. */
function Ch({ to }: { to: string }) {
  return <Ref to={to}>Chapter {chapterNo(to)}</Ref>;
}

/** Two chapters at once: "Chapters 5 and 8", each number a link. */
function Chs({ to: [a, b] }: { to: [string, string] }) {
  return (
    <>
      Chapters <Ref to={a}>{chapterNo(a)}</Ref> and <Ref to={b}>{chapterNo(b)}</Ref>
    </>
  );
}

// ─── Actions for the "Try it" buttons ────────────────────────────────────────────────────

/** Actions that move the camera or plan a trip wait until the ship is back. */
const docked =
  (fn: () => void) =>
  (): void => {
    if (useUI.getState().tripActive) {
      notice('Not available in flight: finish or abort the trip first.');
      return;
    }
    fn();
  };

const planFlight = (dest: BodyId, beta: number, fromEarth = false) =>
  docked(() => {
    // Flights leave from the camera, so start from home when the text assumes it.
    if (fromEarth) goToBody('earth');
    useUI.setState({ plannerOpen: true, plannerDest: dest, plannerDrive: 'cruise', plannerBeta: beta });
  });

// ─── Typography helpers ──────────────────────────────────────────────────────────────────

/** Power of ten, typeset: 10ⁿ. */
const P10 = ({ n }: { n: ReactNode }) => (
  <>
    10<sup className="sup">{n}</sup>
  </>
);
const TryRow = ({ children }: { children: ReactNode }) => <div className="doc-tryrow">{children}</div>;

/** Set the symbols of a plain string (Greek letters, and v, c, t standing alone) in italics, as in print. */
function ital(s: string): ReactNode {
  return s.split(/([βγτφθχνσλ]′?|(?<![A-Za-z])[vct](?![A-Za-z]))/).map((part, k) => (k % 2 ? <i key={k}>{part}</i> : part));
}

/** A link into Learn that closes nothing: the reading view simply turns to the article. */
function LearnLink({ slug, children }: { slug: string; children: ReactNode }) {
  return (
    <a
      href={`#/learn/${slug}`}
      onClick={(e) => {
        e.preventDefault();
        openLearn(slug);
      }}
    >
      {children}
    </a>
  );
}

// ─── Chapters ────────────────────────────────────────────────────────────────────────────

function Welcome() {
  return (
    <Chapter
      id="welcome"
      n={chapterNo('welcome')}
      title="Welcome to Skyfold"
      lead={
        <>
          Skyfold is a space exploration tool with real physics. It shows the universe as it is at this moment, from the
          planets at true scale to the stars, the Milky Way and the galaxies beyond, and lets you fly through it at nearly the
          speed of light, with the sky and the clocks behaving exactly as relativity says they must.
        </>
      }
    >
      <H3>What you can do</H3>
      <ul>
        <li>
          <b>Explore.</b> Press <b>Where to?</b> and name a place: a planet, the Moon, Voyager 1, a star, a nebula, the Andromeda
          Galaxy. Read each card, run time forwards to watch the orbits turn, or go to any date from 10,000 BCE to 9999.
        </li>
        <li>
          <b>Fly.</b> Take a one-click journey, or fly anywhere at 1 g or at any speed below <i>c</i>. Watch the stars crowd ahead
          of you and change colour, and see how much less time passes for you than at home. Go beyond the Local Group and space
          itself expands while you travel.
        </li>
        <li>
          <b>Read.</b> <b>Learn</b> has long reads on the science behind the view: how it was found out, what the physics says and
          what comes next, with sources to go further (<Chs to={['universe', 'seeing']} />).
        </li>
        <li>
          <b>Measure, if you want to.</b> Every number is live in the instrument panel (<Ch to="readings" />), and the physics
          reference gives the equations behind what you see (<Ch to="seeing" />). Neither opens unless you ask for it.
        </li>
      </ul>

      <H3>What is real, and what is a model</H3>
      <p>
        Planet positions come from published ephemerides for the date shown at the top of the screen: to about an arcminute
        between 1700 and 2200, to about half a degree between 3000 BCE and 3000 CE, and only illustrative beyond (the orbits are
        right, the places along them are not). The stars, the star clusters, the nebulae and the galaxies are at their measured
        distances (the farthest galaxies at the distance their redshift gives). Distances are never compressed, light travels at 299,792.458 km/s, and what you see in flight follows the
        transformation laws of special relativity exactly, and near a black hole those of general relativity: its light
        bent and its clocks slowed as Einstein’s theory says for a black hole that does not spin.
      </p>
      <p>
        Where the measurements run out, a model takes over, and the card says so. The Milky Way seen from outside is a model
        built from published measurements, its spiral arms carried on beyond the parallax data. Other galaxies are drawn from
        their measured size, brightness and tilt, with the shape typical of their type. Round the black hole at the Galaxy’s
        centre the crowd of stars and the glowing gas falling in are models too. The cosmic web is a survey, with gaps,
        and the map of the oldest light is contrast enhanced. <Ch to="universe" /> says what each of them is.
      </p>
      <p>
        Some things are idealised, and the program says so where it matters: the constant-speed drive starts and stops
        instantly, gravity is ignored on a flight, and flights beyond the Local Group assume a perfect engine and a destination
        that moves with the expansion of the universe. A third drive, faster than light, is outright fiction, offered only for
        comparison. It is marked in red wherever it appears. The full list is under{' '}
        <Ref page="about" to="limitations">
          Model limitations
        </Ref>{' '}
        on the About page.
      </p>

      <H3>How to use this guide</H3>
      <p>
        Chapters 2 and 3 are all you need to get started. Chapters 4 to {chapterNo('readings')} explain each part of the
        program and what you are looking at, and chapters {chapterNo('controls')} to {chapterNo('glossary')} are for looking
        things up. Buttons marked <b>Try it</b> close the guide and do what the text
        describes. The simulation pauses while the guide is open.
      </p>
      <TryRow>
        <Try run={startTour}>Take the tour</Try>
        <Try run={openSearch}>Where to?</Try>
        <Try run={showWelcome}>Show the welcome screen</Try>
      </TryRow>

      <Note title="What you need">
        A desktop or laptop browser with WebGL 2: a recent Chrome, Edge, Firefox or Safari. A mouse or trackpad is easiest;
        phones work, with a simpler layout. Nothing is installed and there is no account. Your settings stay in your browser.
      </Note>
    </Chapter>
  );
}

function QuickStart() {
  return (
    <Chapter id="quick-start" n={chapterNo('quick-start')} title="Quick start" lead="Ten minutes, eight steps. Most have a button that sets them up for you.">
      <Steps>
        <li>
          <b>Look around.</b> Drag in the view to orbit Earth, and scroll to move in and out. The distance scale is logarithmic,
          so the same gesture takes you from the Moon’s orbit to the edge of the Solar System, and on out to the stars.
        </li>
        <li>
          <b>Go somewhere.</b> Press <b>Where to?</b> (or <Kbd>/</Kbd>), type <i>sat</i> and press <Kbd>Enter</Kbd>. The camera
          glides to Saturn and a card in the corner tells you about it. Camera moves are for looking; they are not journeys.
          <TryRow>
            <Try run={openSearch}>Open Where to?</Try>
            <Try run={docked(() => goToBody('saturn'))}>Go to Saturn</Try>
          </TryRow>
        </li>
        <li>
          <b>See the scale.</b> Click <b>Solar System</b> at the bottom of the screen to see the whole of it. At true scale even
          Jupiter, seen from Earth, is smaller than a pixel, so rings and labels mark where the planets are. Press <Kbd>T</Kbd>{' '}
          to draw every body at least a few pixels across; the distances stay the same.
          <TryRow>
            <Try run={docked(frameSolarSystem)}>Frame the Solar System</Try>
          </TryRow>
        </li>
        <li>
          <b>Speed up time.</b> Press <Kbd>]</Kbd> four times, or click the arrow to the right of the rate at the bottom left:
          each real second is then 2.8 hours. Press <Kbd>N</Kbd> to return to the present.
          <TryRow>
            <Try
              run={() => {
                setWarp(10_000);
                setPaused(false);
              }}
            >
              Run time at 2.8 hours a second
            </Try>
          </TryRow>
        </li>
        <li>
          <b>Take a journey.</b> Press <b>Journeys</b> in the header. Each of the {countWord(JOURNEYS.length)} is one click, and says what to look for
          while it runs. Start with <i>Race sunlight to Earth</i> or <i>Earth to Saturn at 0.9c</i>.
          <TryRow>
            <Try run={openJourneys}>Open the journeys</Try>
          </TryRow>
        </li>
        <li>
          <b>Fly somewhere yourself.</b> Select a planet and press <b>Fly here</b> on its card, or <b>Fly</b> beside it in Where
          to?. The flight planner opens, set to a rocket pushing at 1 g from where you are, and shows how long the trip will
          take for you and at home. Press <b>Ignite</b>. To fly at a steady speed instead, choose <b>Constant speed</b> in the
          planner and pick the speed.
          <TryRow>
            <Try run={planFlight('saturn', 0.9, true)}>Plan a flight from Earth to Saturn at 0.9c</Try>
          </TryRow>
        </li>
        <li>
          <b>Look at the sky.</b> In flight, drag to look around. Stars crowd towards the direction of motion, turn blue ahead
          and red behind, and brighten ahead. Press <Kbd>X</Kbd> to split the screen: the left side shows the sky without
          relativity. The panel along the bottom shows your speed, your clock, the clock at home and the distance left.{' '}
          <b>Skip to arrival</b> jumps to the end, and the readings stay exact.
        </li>
        <li>
          <b>Leave the Galaxy.</b> Click <b>Milky Way</b> in the trail at the bottom of the screen (on wide screens) to see the
          Galaxy from 100,000 light-years: a model built from published measurements. <b>Local Group</b> goes out to Andromeda
          and its neighbours, and <b>Where to?</b> finds any galaxy by name. A 1 g flight to Andromeda takes under 30 years by
          your clock, and over two million at home. Or press <Kbd>F</Kbd> to <b>roam</b>: fly the camera yourself with{' '}
          <Kbd>W</Kbd> <Kbd>A</Kbd> <Kbd>S</Kbd> <Kbd>D</Kbd>, at a pace that crosses from one galaxy to the next in seconds
          (<Ch to="looking" />).
          <TryRow>
            <Try run={() => runScene('milky-way-outside')}>See the Milky Way from outside</Try>
            <Try run={() => runScene('local-group')}>See the Local Group</Try>
          </TryRow>
        </li>
      </Steps>
    </Chapter>
  );
}

const SCREEN_PARTS: [number, ReactNode, ReactNode][] = [
  [1, 'Skyfold', 'The name opens the About page.'],
  [
    2,
    'Date',
    <>
      The date and time being shown, in UTC. Amber, with a dot, when it is not the present. Click it to go to another date (
      <Ch to="time" />).
    </>,
  ],
  [3, <>Where to? <Kbd>/</Kbd></>, <>Find any place by name, from the Moon to Andromeda, and go there or fly there (<Ch to="looking" />).</>],
  [4, 'Journeys', <>{countWordStart(JOURNEYS.length)} one-click trips and scenes (<Ch to="flying" />).</>],
  [5, <>Learn <Kbd>E</Kbd></>, <>Long reads on the science behind the view, from relativity to the galaxies (<Chs to={['universe', 'seeing']} />).</>],
  [
    6,
    'View',
    'Display layers (the constellations, planet hosts, the cosmic web, the CMB map), body size and optics, with gravitational lensing and the accretion flow under the optics; the instrument panel, the physics reference and physics hints; the guide, the keys and About. Below 900 pixels it shows as an icon.',
  ],
  [
    7,
    'The view',
    'The simulation. Top left: what the camera is doing and its range to the target (while you roam, Roam’s panel), and the cards of the cosmic web, the CMB map and the models round Sagittarius A* while they show. Top centre: status lamps. Top right: the card of the selected body. Bottom left: a scale bar; bottom right, the credits of the nebulae’s pictures in view. In flight, a panel along the bottom; close to a black hole, a small chip there that opens one.',
  ],
  [8, 'Time', <>Pause; slower and faster, with the rate in words; Now (<Ch to="time" />).</>],
  [
    9,
    'Where you are',
    'Where the camera is, as a trail from the observable universe down to the body in view: … › Local Group › Milky Way › Orion Arm › Solar neighbourhood › Solar System › Earth. Click a level to go there; the outer levels show on wide screens. Bodies lists everything you can visit, by kind, from the planets to the galaxies.',
  ],
  [10, <>Keys <Kbd>?</Kbd></>, 'The keyboard and mouse on one sheet. On wide screens the status beside it says what the camera is doing.'],
  [11, <>Instrument panel <Kbd>I</Kbd></>, <>Every number, live: speed, clocks, the target, optics and light-time (<Ch to="readings" />).</>],
];

function Screen() {
  return (
    <Chapter
      id="screen"
      n={chapterNo('screen')}
      title="The screen"
      lead="Everything on screen, numbered as in Figure 3.1. A first visit shows only the header, the view and the footer; the two side panels open when you ask for them."
    >
      <Fig
        n="3.1"
        wide
        caption="The Skyfold screen with the instrument panel open on the right (View › Instrument panel, or I). The physics reference, when you open it, sits on the left."
      >
        <ScreenMap />
      </Fig>
      <table className="doc-tbl doc-tbl-parts">
        <tbody>
          {SCREEN_PARTS.map(([n, name, text]) => (
            <tr key={n}>
              <td className="w-8">
                <Callout n={n} />
              </td>
              <td className="doc-tbl-k">{name}</td>
              <td>{text}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        On narrow screens the header keeps its icons and drops their words, <b>Where to?</b> last. Point at an icon to see its
        name.
      </p>

      <H3>Panels</H3>
      <p>
        The instrument panel opens on the right from <b>View › Instrument panel</b>, from <b>Details</b> on a body’s card, or
        with <Kbd>I</Kbd>. The physics reference opens on the left from <b>View › Physics reference</b>. Nothing opens either
        panel by itself, and the physics reference stays closed when you reload the page. Drag the inner edge of a panel to resize it, or double-click the edge to
        reset it; from the keyboard, Tab to the edge and use the arrow keys. On screens narrower than 900 pixels the panels open
        over the view, one at a time, and get out of the way when you plan a flight.
      </p>

      <H3>Status lamps</H3>
      <p>Lamps along the top of the view light up when something changes what you see.</p>
      <KeyTable
        rows={[
          [<Lamp tone="white">Paused</Lamp>, 'The simulation clock is stopped.'],
          [
            <Lamp tone="amber">
              Rate <P10 n={3} />
            </Lamp>,
            'Time runs faster than real time. The view also gets an amber border.',
          ],
          [<Lamp tone="amber">1 s = 3.4 months on board</Lamp>, <>In flight: how much of your time passes each second (<Ch to="flying" />).</>],
          [<Lamp tone="amber">Free flight</Lamp>, <>You are flying the ship by hand, at no more than the speed of light (<Ch to="looking" />).</>],
          [
            <Lamp tone="amber">Home ×10.05</Lamp>,
            <>
              Near a black hole, while its panel is open: home’s clock runs this many times faster than a clock hovering here,
              because the hole’s gravity slows time where you are. It lights from ×1.01 (<Ch to="time" />); with the panel
              closed its chip says the same.
            </>,
          ],
          [
            <Lamp tone="red">Falling</Lamp>,
            <>
              You are falling freely into a black hole; in reality there is no way back (Stop the fall resets you,{' '}
              <Ch to="flying" />).
            </>,
          ],
          [
            <Lamp tone="cyan">Relativistic optics</Lamp>,
            <>
              The view shows aberration and Doppler shift; in split screen the lamp reads <i>Split optics</i> (
              <Ch to="seeing" />).
            </>,
          ],
          [<Lamp tone="cyan">Light-time corr.</Lamp>, 'Bodies are drawn where they were when the light now arriving left them.'],
          [<Lamp tone="cyan">Pulse in flight</Lamp>, 'A light pulse is still spreading.'],
          [<Lamp tone="red">Non-physical state</Lamp>, 'The fictional faster-than-light drive is engaged.'],
        ]}
      />

      <H3>Messages and hints</H3>
      <p>
        When something you asked for cannot be done, a message says why for about 14 seconds in the top-left corner of the
        view. If you turn on <b>View › Physics hints</b> (it starts off), a short note in the top-right corner says in a sentence
        what is going on the first time something new happens, passing 0.1<i>c</i> say, and <b>Read more</b> opens the Learn
        article that tells the whole story. Each note appears once.
      </p>
    </Chapter>
  );
}

function Looking() {
  return (
    <Chapter
      id="looking"
      n={chapterNo('looking')}
      title="Looking around"
      lead="The camera normally orbits one body. It can go anywhere, at any distance, without that counting as a journey."
    >
      <H3>Orbiting a body</H3>
      <KeyTable
        rows={[
          ['Drag', 'Orbit around the target'],
          [
            <>
              Scroll, <Kbd>+</Kbd> <Kbd>−</Kbd>
            </>,
            'Move in and out (the scale is logarithmic; hold Shift to go five times faster)',
          ],
          ['Arrow keys', 'Orbit'],
          [<Kbd key="h">H</Kbd>, 'Return to Earth'],
        ]}
      />
      <p>
        Round a black hole the camera <i>hovers</i>: it holds its place against the hole’s pull, as a rocket would, and
        scrolling moves it in height above the horizon rather than in distance from the centre, down to a millionth of the
        horizon’s radius above it (12.7 km above the horizon of Sagittarius A*, 27 mm above Gaia BH1’s). Close in, a small
        chip at the bottom of the view says how much slower your clock runs than home’s; its <b>Details</b> opens a panel
        with both clocks, how hard the rocket must push and how strong the tides are (<Ch to="flying" />).
      </p>

      <H3>Where to?</H3>
      <p>
        <b>Where to?</b> in the header (or <Kbd>/</Kbd>, or <Kbd>Ctrl</Kbd>+<Kbd>K</Kbd>) finds any place by name: a planet or a
        moon, a spacecraft, any of the 330,000 stars, a planet of another star, a star cluster, a nebula, a black hole, a
        galaxy, the cosmic web. It forgives
        part of a name (<i>prox</i>), a nickname (<i>Luna</i>, <i>the red planet</i>) and a slip of the keyboard (
        <i>Satrun</i>). Each result gives what it is, how far away it is and how long its light takes to reach you (for a
        galaxy in the expanding universe, how long ago the light now arriving left it); the
        highlighted one also shows what a flight there at 1 g would take for you and at home. A planet of another star has a
        small letter and a star of a system a capital, as astronomers write them: <i>Kepler-16 b</i> is the planet,{' '}
        <i>Kepler-16 B</i> the second star. Choose with the arrow keys.{' '}
        <Kbd>Enter</Kbd> (or <b>Go</b>) takes the camera there; <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> (or <b>Fly</b>) opens the
        flight planner set to that 1 g flight. Before you type, it offers {countWord(FEATURED_IDS.length)} places from the Moon
        out to the centre of the Galaxy and Andromeda ({featuredNames()}), each with what a 1 g flight there would take, and
        the journeys.
      </p>
      <TryRow>
        <Try run={openSearch}>Open Where to?</Try>
      </TryRow>

      <H3>Choosing a body</H3>
      <p>
        Click a body (a planet, a star, a nebula, a galaxy) or its label to <i>select</i> it. Amber brackets mark it, its label shows its range and light-time, and a
        card in the top-right corner of the view says what it is, how far away it is, how long its light took to reach you, and
        three things worth knowing about it. On the card, <b>Go there</b> takes the camera to it, <b>Fly here</b> plans a 1 g
        flight, <b>Read</b> opens its story in Learn where there is one, and <b>Details</b> opens the instrument panel with its
        full data sheet. <Kbd>Esc</Kbd> clears the selection.
      </p>
      <p>
        To take the camera somewhere directly, double-click the body, click it in <b>Bodies</b> at the bottom of the screen, or
        press its key: <Kbd>0</Kbd> for the Sun, <Kbd>1</Kbd> to <Kbd>9</Kbd> for Mercury to Pluto, <Kbd>M</Kbd> for the Moon
        and <Kbd>V</Kbd> for Voyager 1. In <b>Bodies</b> the moons sit under their planets (the ▸ beside a planet opens its
        moons), followed by the dwarf planets, asteroids and Kuiper belt objects, comets, interstellar visitors, spacecraft,
        stars, planets of other stars, and then the Milky Way (the Galaxy itself, Sagittarius A* with its stars, the other
        black holes, each paired with its star where it has one, and the galaxies that orbit it), the star clusters (open, then globular), the nebulae (where stars are born, what dying stars
        shed, and those in the Magellanic Clouds), the other galaxies (the Local Group, those beyond it and the most distant
        known) and the clusters, the cosmic web and the CMB map. Under <b>Bodies › Stars</b> the named stars are sorted into those within 16 light-years, those with planets and
        the bright ones, and a star system (Alpha Centauri, Sirius) has a row of its own with its stars and planets under it;
        stars you found in search come last. <b>Where to?</b> finds any of the 330,000 stars in the sky by name or catalogue
        number (Vega, α Lyrae, HIP 91262). The trail beside <b>Bodies</b> says where the camera is (Observable universe › Local
        Universe › Local Group › Milky Way › Orion Arm › Solar neighbourhood › Solar System › Saturn › Titan); click a level to
        see it all at once: <b>Solar neighbourhood</b> steps back 26 light-years from the Sun, among the nearest stars,{' '}
        <b>Milky Way</b> goes out to see the Galaxy from 100,000 light-years, <b>Local Group</b> to 3 million parsecs and{' '}
        <b>Local Universe</b> to the cosmic web. The spiral arm is named only where the arms have been measured: within two of
        their widths of an arm’s ridge, on the stretch that radio parallaxes of star-forming regions trace (Reid et al. 2019).
        The Local Group is what lies inside its zero-velocity surface, where gravity has stopped the expansion; the local
        universe reaches redshift 0.1, about as far as distances are measured galaxy by galaxy. On narrow screens these
        levels are left out of the trail.
      </p>
      <Note title="The camera is not a spaceship">
        Camera moves ignore physics: the camera glides to its target in a few seconds (never more than six), whatever the
        distance. To travel physically, with clocks that obey relativity, take a journey or fly (<Ch to="flying" />).
      </Note>

      <H3>True scale and enlarged</H3>
      <p>
        At true scale the Solar System is almost entirely empty. Seen from Earth, Jupiter is less than a minute of arc across,
        smaller than one pixel of your screen, while the Sun is half a degree. Labels and rings therefore mark where the bodies
        are. <b>View › Body size › Enlarged</b> (<Kbd>T</Kbd>) draws every body at least 8 pixels across without moving it:
        useful for finding planets from far away, misleading about their size.
      </p>
      <TryRow>
        <Try run={() => useUI.getState().setSizeMode('visible')}>Draw bodies enlarged</Try>
      </TryRow>

      <H3>Display layers</H3>
      <p>These are all in the View menu.</p>
      <KeyTable
        rows={[
          [<>Orbits <Kbd>O</Kbd></>, 'Each body’s orbit, computed from its current position and velocity.'],
          [<>Labels <Kbd>L</Kbd></>, 'Names, and the range and light-time of the selected body.'],
          [
            <>Small bodies <Kbd>B</Kbd></>,
            'Every asteroid and comet with a good orbit in the JPL Small-Body Database, 1.47 million, each as bright as it really is from the camera. The brightest 200,000 from where you are are drawn, and any passing close; click one for its card, or find it in Where to? by name or number.',
          ],
          [<>Ecliptic grid <Kbd>J</Kbd></>, 'Lines of ecliptic longitude and latitude every 15°, labelled, with an axis triad in the corner.'],
          [
            <>Constellations <Kbd>Y</Kbd></>,
            'The 88 constellation figures and their names, drawn between the real stars, so they come apart as you fly away. They show by themselves once you are among the stars (0.65 light-years or more from the Sun), each fading away once it has come apart; Y turns them all on or off for good.',
          ],
          [
            'Planet hosts',
            'A small ring around each star of the catalogue with known planets, within 130 light-years (40 parsecs) of you. Point at one for the star’s name; click it to select the star. Like the constellations, they show by themselves once you are among the stars.',
          ],
          ['Cosmic web', 'The 55,877 galaxies of Cosmicflows-4 as a map, coloured by kind and sized by infrared luminosity. It shows by itself beyond the Local Group; its card lists what the survey misses.'],
          [
            'CMB map',
            <>
              The cosmic microwave background over the sky (WMAP), contrast enhanced about 10,000 times, with its label. Drawn
              whenever the relativistic view is off: below 0.01<i>c</i>, in classical optics, and on the classical side of the split
              screen.
            </>,
          ],
          [<>Readouts over the view <Kbd>U</Kbd></>, <>The camera readout and scale bar; in flight also the reticle and the apex markers (<Ch to="readings" />).</>],
          ['Light-time correction', 'Draw each body where it was when the light now reaching you left it.'],
          [
            'Gravitational lensing',
            <>
              Under the optics, and on by default: light bent by the black hole that bends it most where you are (
              <Ch to="seeing" />). Off, light is drawn straight, so the black hole and its resolved gas cannot be seen (from far
              away its gas still shows as a point).
            </>,
          ],
          [
            'Accretion flow',
            'On by default: a model of the hot gas falling into Sagittarius A*, a bright point from far away and a ring bent round the shadow close by. Off, the black hole shows against the sky alone. The scenes made to show the lens switch it off, and say so.',
          ],
        ]}
      />
      <p>
        Neither of the last two is remembered between visits: each starts on, so that a black hole never goes missing on
        your next visit because of a switch you forgot.
      </p>

      <H3>Roam</H3>
      <p>
        Press <Kbd>F</Kbd> (or <b>View › Roam</b>) to fly the camera anywhere yourself, with nothing in focus and no speed
        limit. A drag turns the view (on a touch screen, one finger), and the keys move it:
      </p>
      <KeyTable
        rows={[
          ['Drag', 'Look round (the sky follows the pointer)'],
          [
            <>
              <Kbd>W</Kbd> <Kbd>A</Kbd> <Kbd>S</Kbd> <Kbd>D</Kbd> or the arrows
            </>,
            'Forward, left, back, right',
          ],
          [
            <>
              <Kbd>Space</Kbd> or <Kbd>R</Kbd> · <Kbd>C</Kbd>
            </>,
            'Up · down',
          ],
          [
            <>
              <Kbd>Q</Kbd> <Kbd>E</Kbd>
            </>,
            'Roll',
          ],
          [<Kbd key="shift">Shift</Kbd>, `${countWordStart(ROAM_BOOST)} times faster, while held`],
          [
            <>
              Scroll, <Kbd>+</Kbd> <Kbd>−</Kbd>
            </>,
            'Set the pace, from a thousandth to a thousand times the one your surroundings set',
          ],
          [
            <>
              <Kbd>F</Kbd> or <Kbd>Esc</Kbd>
            </>,
            'Leave: the camera orbits the nearest thing from where it is',
          ],
        ]}
      />
      <p>
        The pace follows your surroundings: each second the camera covers {rateWords(ROAM_RATE)} the distance to the nearest
        thing that matters there, whether the surface of a moon, a star, the edge of a galaxy or the next group of galaxies.
        So it slows by itself as a planet comes close and never runs into it, stars stream past a few light-years apart, and
        the gap from the Milky Way to Andromeda takes seconds. The panel at the top left names the nearest thing and how far
        it is, and gives the pace in plain words, <i>1.2 light-years a second</i>; past the speed of light it says so: this is
        a camera, not a ship, so there is no relativity and no clock to fall behind. The camera keeps its place beside the
        nearest body as time runs, and sees what an observer at rest there would. Near a black hole that is an observer
        hovering: its lens and its clock are there as usual, and the camera stops at the same height above the horizon as
        the orbiting camera does. Click a body to select it, or double-click to go there, as always.
      </p>
      <p>
        On a touch screen two arrows halfway down the right edge move the camera forward and back while you hold them. <b>Mouse look</b> on
        the panel lets the mouse turn the view without a drag; <Kbd>Esc</Kbd> gives the pointer back. Roam is not available
        during a trip or a fall into a black hole.
      </p>
      <TryRow>
        <Try run={startRoam}>Roam from here</Try>
      </TryRow>

      <H3>Flying the ship</H3>
      <p>
        <b>Fly the ship</b> on Roam’s panel hands over to the ship itself: the speed of light is its limit and relativity is on.
        The pointer is captured so that the mouse steers, <Kbd>W</Kbd> <Kbd>A</Kbd> <Kbd>S</Kbd> <Kbd>D</Kbd>,{' '}
        <Kbd>Space</Kbd> or <Kbd>R</Kbd>, <Kbd>C</Kbd> and <Kbd>Q</Kbd> <Kbd>E</Kbd> move and roll it as in Roam, and the wheel
        sets the throttle, from 0.3 m/s to 0.999 99<i>c</i>. <Kbd>Esc</Kbd> releases the pointer and goes back to Roam;{' '}
        <Kbd>F</Kbd> leaves for orbit.
      </p>
      <p>
        The ship is for sightseeing at real speeds. The throttle is shown on the panel and in the status bar at the bottom
        right, and the relativistic optics switch on above 0.01<i>c</i>, but only planned flights count as trips. Near a black
        hole the throttle is your speed past observers hovering there: the engine is taken to hold the ship against the
        hole’s pull, and the black-hole panel gives the thrust your motion takes.
      </p>

      <H3>Clean full screen</H3>
      <p>
        <b>View › Clean full screen</b> (<Kbd>Shift</Kbd>+<Kbd>F</Kbd>) shows the universe alone: full screen, with every
        piece of text and every panel hidden, the labels and names too. Everything still works: drag and scroll, Roam, the
        keys. A hint says how to leave for two seconds: <Kbd>Esc</Kbd>, <Kbd>Shift</Kbd>+<Kbd>F</Kbd>, or the browser’s own
        way out of full screen. Everything comes back exactly as it was. Where the browser does not allow full screen (an
        iPhone, or Skyfold inside another page), the interface is hidden all the same. One line stays: while a nebula’s
        photograph is on screen, its credit, faint in the bottom corner, because the licence of the pictures (CC BY 4.0) asks
        for it wherever they show. On a touch screen Roam’s arrows stay too.
      </p>
      <TryRow>
        <Try run={enterClean}>Clean full screen</Try>
      </TryRow>
    </Chapter>
  );
}

/** Learn articles about what is out there, in the order to read them. */
const OUT_THERE: Reading[] = [
  { slug: 'how-far-are-the-stars', title: 'How far are the stars?', what: 'Parallax, and how the distances behind the star map were measured, down to Gaia.' },
  { slug: 'what-stars-are-made-of', title: 'What stars are made of', what: 'Spectra, what makes a star shine, and how stars live and die.' },
  { slug: 'other-worlds', title: 'Other worlds', what: 'How the planets of other stars were found, from wobbles and shadows to pictures.' },
  { slug: 'our-galaxy', title: 'Our galaxy', what: 'How the Milky Way was mapped from inside, and the black hole at its centre weighed.' },
  { slug: 'black-holes', title: 'Black holes', what: 'What one would look like up close, how the real ones were found, and what falling into one would be like.' },
  { slug: 'island-universes', title: 'Island universes', what: 'How the spiral nebulae turned out to be other galaxies, and Andromeda’s approach.' },
  { slug: 'the-expanding-universe', title: 'The expanding universe', what: 'Redshifts, the expansion, and the oldest light there is.' },
  { slug: 'the-edge-of-reach', title: 'The edge of reach', what: 'Why some galaxies we can see could never be reached, even at the speed of light.' },
];

function Universe() {
  return (
    <Chapter
      id="universe"
      n={chapterNo('universe')}
      title="What is out there"
      lead="From the Moon to the most distant galaxies known, everything is where it has been measured to be. Where the measurements stop, a model takes over, and the card says which is which."
    >
      <H3>The Solar System</H3>
      <p>
        The Sun, the planets and the Moon follow published ephemerides. The other moons, the dwarf planets, the comets, the
        interstellar visitors and the spacecraft follow fits to JPL’s Horizons, and 31,930 asteroids, Trojans and
        trans-Neptunian objects their catalogued orbits (<Kbd>B</Kbd>). Each body’s card says how far to trust what you see:
        where its position comes from and how accurate it is at the date shown, and what else is a model, such as a rotation no
        one can predict or a surface never mapped. Its facts link to their sources.
      </p>

      <H3>Stars and their planets</H3>
      <p>
        The stars are where they really are, in three dimensions: each at its measured distance (mostly from ESA’s Gaia
        mission), moving with its measured velocity, as bright and as coloured as it looks from where you are. From Earth they
        make the familiar sky; fly among them and the constellations come apart. Come within a third of a light-year of a star
        and it becomes a body you can orbit, a glowing disc at its measured (or estimated) size. The sky shows stars down to
        magnitude 6.5, as the eye would; the catalogue goes to 10, so fainter stars appear as you approach them.
      </p>
      <p>
        Many stars have planets. <b>Where to?</b> finds any of the 6,372 confirmed planets of NASA’s Exoplanet Archive by name
        (<i>K2-18 b</i>, <i>51 Pegasi b</i>) and takes you to its star, which joins the view with its planets even when it is
        too faint for the star catalogue. Eleven systems are built from their papers, among them TRAPPIST-1’s seven planets and
        HR 8799’s four giants on their measured orbits. Each planet goes round on a fixed Kepler orbit, timed so that from the
        Sun transits happen at their published times. Nobody has seen the surface of any of them, so their colours are
        illustrative, and the card says so, along with what else is assumed (often the orbit’s orientation on the sky). Once
        you are among the stars, a small ring marks each star of the catalogue with known planets, within 130 light-years (
        <b>View › Planet hosts</b>). Point at a ring to see the star’s name and how many planets it has; click it to select the
        star, and its planets join the view.
      </p>
      <TryRow>
        <Try run={() => runScene('go:proxima')}>Go to Proxima Centauri</Try>
      </TryRow>

      <H3>The Milky Way</H3>
      <p>
        From anywhere near the Sun the glow of the Milky Way behind the stars is the real sky: the light of the stars too faint
        to draw one by one, mapped by ESA’s Gaia satellite and rendered by NASA’s Scientific Visualization Studio, with its
        dark dust lanes (the Great Rift through Cygnus and Aquila, the Coalsack beside the Southern Cross) where they really
        are. The light of the star catalogue’s own faint stars, down to magnitude 10, is added to it. It is drawn as bright, for its size, as the faint stars are, and it fades out where the eye would lose it, about
        as faint as the darkest skies on Earth. In flight it is squeezed ahead of you and shifted in colour like everything
        else.
      </p>
      <p>
        That sky is the view from the Sun, so it fades out a few hundred parsecs away, and a model of the whole Galaxy takes
        over: 200,000 points of light drawn from the laws that describe its disc, its bar and bulge, its halo and its spiral
        arms, dimmed by a model of its dust along each line of sight. It is a <b>model built from published measurements</b>{' '}
        (Reid et al. 2019 arms, Wegg et al. bar, Drimmel and Spergel dust): the points are not real stars, and the far side of
        the Galaxy has never been mapped directly, so the arms there are carried on beyond the parallax data. Close to the
        camera each point would stand for hundreds of thousands of suns spread over hundreds of parsecs, so there the discs
        and the young stars of the arms are drawn as a smooth glow worked out from the same laws, and the points take over 1
        to 4 kiloparsecs out. From 100,000 light-years it is a barred spiral with the Sun about halfway out. Seen from the Sun
        the model is within half a magnitude of the real sky towards the Galaxy’s anticentre and poles, but over a magnitude
        fainter towards the star clouds of Sagittarius and Scutum: its dust is smooth, without the gaps that let their light
        through.
      </p>
      <p>
        Among the stars are 1,664 star clusters. The open clusters’ stars are the star catalogue’s own; a ring marks each
        famous one (the Pleiades, the Hyades, Praesepe…) by the radius holding half its members. The 164 globular clusters are
        drawn as glows with their measured brightness and size, speckled with points that show how their light gathers to
        the middle (the points are illustrative, not their real stars). The 45 nebulae are photographs from ESO, ESA/Hubble,
        ESA/Webb and NSF NOIRLab placed at their measured distances and true sizes. A photograph is the view from Earth only,
        so from anywhere else it is drawn as a flat card facing the Sun: it fades away seen edge-on, and from the far side it
        shows the picture mirrored. Its brightness is set for display, as in a long-exposure photograph. Every picture in
        view carries its credit and a note of how it was changed, on its body card and in the corner of the view.
      </p>
      <p>
        At the centre is Sagittarius A*, a black hole of 4.3 million solar masses 27,000 light-years away, with the four stars
        whose orbits round it are published under an open licence (S2 goes round every 16 years, turning slowly as general
        relativity says). Other published orbits exist but are not licensed for reuse. The black hole itself, and the others
        Skyfold shows, have a section of their own below.
      </p>
      <TryRow>
        <Try run={() => runScene('milky-way-outside')}>See the Milky Way from outside</Try>
        <Try run={() => runScene('galactic-centre-orbits')}>Watch S2 go round</Try>
      </TryRow>

      <div id="doc-black-holes">
        <H3>Black holes</H3>
        <p>
          Eleven real black holes are in the sky. <b>Sagittarius A*</b> is at the centre of the Milky Way, and <b>M87*</b>,
          6.5 billion times the Sun’s mass, at the heart of the galaxy M87, 55 million light-years away. The rest are a few
          times the Sun’s mass and are known by what they do to a star: <b>Gaia BH1</b>, 1,570 light-years away and the
          nearest known, <b>Gaia BH2</b> and <b>Gaia BH3</b> (at 32.7 solar masses the heaviest stellar black hole known in
          the Galaxy) were found by the wobble of a companion star in the Gaia satellite’s measurements; <b>Cygnus X-1</b>,{' '}
          <b>V404 Cygni</b>, <b>A0620-00</b>, <b>MAXI J1820+070</b> and <b>XTE J1118+480</b> by the X-rays of the gas they
          pull off theirs. Each of these eight goes round with its star on the published orbit, and the Bodies list shows
          each beside its star. <b>OGLE-2011-BLG-0462</b> is alone: it was found by the way it bent and brightened the light
          of a star behind it.
        </p>
        <p>
          Twenty-nine more come from a second table: thirteen more X-ray binaries of the Milky Way, among them{' '}
          <b>GRS 1915+105</b> and <b>GRO J0422+32</b>, one of the lightest black holes known; <b>LMC X-1</b> and{' '}
          <b>LMC X-3</b> in the Large Magellanic Cloud and <b>M33 X-7</b> in the Triangulum Galaxy; and the black holes at
          the centres of thirteen nearby galaxies, from <b>M31*</b> in Andromeda to <b>NGC 4889</b>’s, about 21 billion
          times the Sun’s mass. Each card says how its hole was weighed. LMC X-1, LMC X-3, M33 X-7 and GRS 1915+105 are drawn
          with thin discs of hot gas, as Cygnus X-1 is: models of a typical state, not of today. <b>A tour of black
          holes</b>, under Journeys, visits five of them.
        </p>
        <p>
          A black hole has no surface to draw. What you see is its <b>lens</b>: the light of everything behind and around
          it, bent by its gravity, worked out exactly for a black hole that does not spin (<Ch to="seeing" /> says how to
          read it). From <b>Go there</b>’s distance of 4,000 au, Sagittarius A*’s dark shadow is far below a pixel, but the
          stars behind it are pushed into a ring 0.75° across. Come closer and the shadow grows: 28.5° across at ten times
          the radius of its horizon, and at the horizon itself the whole sky is squeezed into a disc overhead. Its card says
          how big it looks from where you are, and how much slower your clock runs there.
        </p>
        <p>
          Round Sagittarius A* two models fill in what is known but cannot be seen from Earth. One is the hot, thin gas
          falling into it, fitted to its measured spectrum: from 4,000 au a point of magnitude −11, a fifth as bright as the
          full Moon, and close by a lopsided ring round the shadow (<b>View › Accretion flow</b>). The other is the Galaxy’s{' '}
          <b>nuclear star cluster</b>, millions of stars within a few parsecs of the hole, drawn as 60,000 stars and a glow
          whose numbers, brightness and colours follow published fits. From near the hole they make the sky bright: seen
          from 4,000 au a few young stars a few hundredths of a parsec away each outshine the full Moon from Earth hundreds
          of times over. The card of each black hole says what else is assumed, and <b>What is modelled here</b> on it leads
          to the full list.
        </p>
        <TryRow>
          <Try run={() => runScene('sgr-a-star-shadow')}>See the shadow of Sgr A*</Try>
          <Try run={() => runScene('fall-into-sgr-a-star')}>Fall into Sgr A*</Try>
        </TryRow>
      </div>

      <H3>Other galaxies</H3>
      <p>
        Beyond the Milky Way are 169 galaxies of the Local Group and its surroundings out to 3 million parsecs, from the Local
        Volume Database (Andromeda, Triangulum, the Magellanic Clouds and the dwarf galaxies round them, each at its measured
        distance), the nearby galaxies the Learn articles talk about (M81, M87, Centaurus A, the Sombrero and the Whirlpool),
        the Virgo, Coma and Bullet clusters, and three of the most distant galaxies confirmed (GN-z11 at redshift 10.6,
        JADES-GS-z14-0 at 14.18 and MoM-z14, at 14.44 the record).
      </p>
      <p>
        No galaxy but ours has been mapped in three dimensions, so each is drawn as a <b>model</b>: a few thousand points
        following the light of its type (a spiral, a barred or Magellanic spiral, an irregular, a dwarf spheroidal, an
        elliptical; the Sombrero as a disc dominated by its bulge), scaled to its measured size and brightness and tilted as
        it lies. Its arms, clumps and dust are typical of its type, not a map of that galaxy. Where a disc’s near side is not
        known the tilt drawn is one of two mirror images; where only its outline on the sky is measured, its depth is taken as
        its width. Each card says which. From Earth Andromeda is a tilted oval 3° long, six full Moons, at its real angle on the
        sky; from above it is a spiral. Seen from far off most galaxies are faint or invisible, as they would be to the eye.
      </p>
      <p>
        The young galaxies are placed where they are now, more than 30 billion light-years away as space has stretched. What
        you would see from there is their light of 13.5 billion years ago, the galaxy as it was a few hundred million years
        after the Big Bang: they are drawn that way, and what they have become since, nobody knows. Space has stretched while their light
        travelled and is stretching still, so they lie beyond the edge of reach: no ship could ever get there, not even light
        sent now (<LearnLink slug="the-edge-of-reach">The edge of reach</LearnLink> tells why).
      </p>
      <TryRow>
        <Try run={() => runScene('local-group')}>See the Local Group</Try>
        <Try run={() => runScene('go:andromeda')}>Go to Andromeda</Try>
      </TryRow>

      <H3>The cosmic web and the oldest light</H3>
      <p>
        <b>View › Cosmic web</b> shows 55,877 galaxies with measured distances (Cosmicflows-4) as a map, at their places now:
        walls and filaments round empty voids. Nearby each sits at its group’s measured distance, farther out at the distance
        its group’s redshift gives. From out there no galaxy is bright enough to see, so the points show where they
        are, orange for ellipticals, blue for spirals, sized by their infrared luminosity. It is a survey, not a census: most of
        its galaxies are in the northern galactic sky, almost none behind the Milky Way’s disc, and single distances are 15 to
        25% uncertain; its card says so. It shows by itself from beyond the Local Group. <b>View › CMB map</b> lays the
        cosmic microwave background over the sky: the oldest light there is, mapped by WMAP, blue colder and red warmer by up
        to 250 millionths of a kelvin. Its contrast is enhanced about 10,000 times: to the eye it is perfectly even.
      </p>
      <p>
        The universe expands with the clock. Run it billions of years ahead, or fly far, and the galaxies beyond the Local
        Group recede: each is held at its place in the expanding universe, so the space between them grows, while the Local
        Group, the groups and the clusters, held together by gravity, keep their size. Their light is the light that arrives:
        reddened and dimmed as space stretches it on the way, and in flight shifted again by your own motion; a galaxy’s card
        says how long ago that light left it and how much it was stretched. The background’s temperature falls as the
        universe grows, 2.72548 K now and 1.45 K ten billion years from now. The CMB map is the pattern seen from the Solar
        System today: from far away, or at another time, the sky shows a different shell of the early universe, so the map
        fades out.
      </p>
      <TryRow>
        <Try run={() => runScene('cosmic-web')}>See the cosmic web</Try>
        <Try run={() => runScene('cmb-map')}>Show the CMB map</Try>
      </TryRow>

      <H3>What is a model</H3>
      <p>Wherever you look, the card says what is measured and what is a model. In short:</p>
      <ul>
        <li>
          <b>The Milky Way seen from outside</b> is a model built from published measurements. Its points are not real stars,
          and its spiral arms are extrapolated beyond the parallax data.
        </li>
        <li>
          <b>Nebulae</b> are their photographs from Earth, at a brightness set for display. From anywhere else they are flat
          cards facing the Sun, mirrored when seen from behind.
        </li>
        <li>
          <b>Globular clusters</b> are glows with their measured brightness and size; the points speckling them are
          illustrative. <b>The S-stars</b> are drawn where their orbits carry them now, 27,000 years beyond the positions whose
          light we see.
        </li>
        <li>
          <b>Other galaxies</b> are modelled from their measured size, brightness and orientation, with the arms, clumps and dust
          typical of their type. Where a disc’s near side is not known, which side is nearer is assumed.
        </li>
        <li>
          <b>The young galaxies</b> are drawn as they were when the light we see left them, with the spectrum of a hot black body
          (their ultraviolet brightness standing in for their visible one), redshifted and dimmed by the expansion. In truth
          hydrogen in the young universe absorbed all their visible light: to the eye they are dark.
        </li>
        <li>
          <b>The cosmic web</b> places each galaxy of Cosmicflows-4 at its group’s measured distance nearby and at the distance
          of its group’s redshift farther out (a single galaxy’s measured distance is 15 to 25% uncertain), and the survey covers
          the sky unevenly: almost nothing behind the Milky Way’s disc.
        </li>
        <li>
          <b>The CMB map</b> is contrast enhanced about 10,000 times; to the eye the oldest light is perfectly even. It is the
          pattern seen from the Solar System today.
        </li>
        <li>
          <b>The expanding universe</b> follows the Planck 2018 cosmology. Galaxies beyond the Local Group are held at their
          places in it (their own motions are not followed), groups and clusters keep their size, and the redshift of their
          light is drawn as if it were a black body’s.
        </li>
        <li>
          <b>Planets of other stars</b> have illustrative colours, and often an assumed orientation.
        </li>
        <li>
          <b>Flights beyond the Local Group</b> assume a perfect engine and a destination that moves with the expansion of the
          universe.
        </li>
      </ul>
      {/* A black hole's card links here (ui/viewport/BodyCard.tsx, "What is modelled here"). */}
      <p id="doc-hole-models">Near the black holes:</p>
      <ul>
        <li>
          <b>Spacetime is curved only near one black hole at a time.</b> Near the black hole whose lens matters most, light
          is bent exactly and clocks slow; everywhere else, and for every other black hole at the same moment, gravity bends
          neither light nor flights (the expansion of the universe and the S-stars’ precession apart), and no other
          gravitational time dilation is applied. The others’ lenses are then far below a pixel.
        </li>
        <li>
          <b>Drawn without spin.</b> Every black hole is drawn as one that does not spin (Schwarzschild’s solution): no
          black hole’s spin is measured well enough to draw (Sagittarius A*’s estimates run from under 0.1 to 0.9 of the
          most a black hole can spin; M87*’s is not measured; Cygnus X-1’s is claimed above 0.998). Spin makes a shadow
          smaller by less than about 8 %, the Event Horizon Telescope’s figure: at the angle we see Sgr A* from, about 25°
          from its axis, a spin of 0.9 to 0.94 would make its shadow about 5 to 7 % smaller and shift it by about 1 M
          (GM/c², 6.3 million km); seen edge-on, a fast spin makes a shadow up to about 12 % narrower and 2.4 M off-centre,
          one side flattened.
        </li>
        <li>
          <b>Inside the shadow there is nothing to see.</b> A black hole formed by a collapsing star has no white hole behind
          it: light traced back into the shadow ends on the collapsed matter, whose light faded long ago.
        </li>
        <li>
          <b>The glow of the sky near the ring</b> (the Milky Way, the Galaxy’s particles, the galaxies, the nuclear cluster’s
          glow) is resampled from pictures of a quarter of the screen’s resolution as if its light came from very far away
          (the nuclear cluster’s own glow partly does not) and, in flight, recoloured with an approximate spectral model.
          The stars keep their exact colours.
        </li>
        <li>
          <b>Guides</b> (constellation figures, planet-host and cluster rings, orbit lines) follow a star’s or a body’s
          main image only; the ecliptic grid is not bent. <b>Nebula pictures</b> bend only as far as their 9 × 9 grids of
          points allow and have no second image; <b>the cosmic web</b> is a map and follows its main image (and its second
          near M87*); <b>galaxies</b> keep the look they have unbent, a single splat or a template, while their light is
          bent.
        </li>
        <li>
          <b>A star exactly behind a black hole</b> would be magnified without limit if it were a point: its own disc caps
          the brightening. The ring it makes is drawn for the Sun, the S-stars and the companions; a catalogue star shows as
          two points.
        </li>
        <li>
          <b>The engine holds the ship.</b> Near a black hole your motion is measured against observers hovering there
          (falling, against observers falling from rest far away), and the rocket is assumed to supply whatever thrust that
          takes. Hovering is allowed even where the tides would tear a ship apart, as the physics of hovering is; the panel
          along the bottom says so in red.
        </li>
        <li>
          <b>Time near a black hole.</b> The rate paces a clock hovering where you are; home’s clock is one far from every
          mass. Only the black hole’s gravity is included (the Sun’s and the Galaxy’s, parts in 10
          <sup className="sup">8</sup> and 10<sup className="sup">6</sup>, are left out), and only where it passes 5 parts
          in 10<sup className="sup">10</sup>.
        </li>
        <li>
          <b>A fall</b> shows home’s clock on the clocks of observers falling freely beside you (Painlevé–Gullstrand time), a
          convention: observers hovering outside would say you never cross the horizon. What you would actually see of home,
          overhead, is shown too. The first stretch plays in 20 s and the last in 80 s: real time at Sgr A*, 25 minutes
          aboard a second at M87*. The fall ends where tides pull a ship apart, 0.03 s before the centre, where general relativity predicts a
          singularity and stops working; stopping puts you back where you let go. Falls into the stellar-mass black holes
          are not offered: their tides tear a ship apart 27 to 78 horizon radii out.
        </li>
        <li>
          <b>The flight planner ignores gravity</b>, so it will not leave from within 30 horizon radii of a black hole.
        </li>
        <li>
          <b>The gas round Sagittarius A*</b> is a model: a hot, thin flow of the kind Broderick and Loeb described (2006),
          fitted to Sgr A*’s spectrum from radio waves to the near infrared, and turned like the flares seen by GRAVITY (a
          model choice), drawn outside the horizon only. Its visible light has never been seen (some 30 magnitudes of dust
          are in the way) and is carried over from the infrared: uncertain about three times either way, and eight times
          fainter in a pessimistic model. It is smooth and steady, where the real flow flickers tenfold within hours. The
          scenes that show the lens switch it off. <b>The 1.3 mm view</b> on its card is the model’s brightness at the Event
          Horizon Telescope’s wavelength in false colour (blurred to the EHT’s resolution when asked), not the EHT’s own
          picture, which the card links to beside it.
        </li>
        <li>
          <b>The stars round Sagittarius A*</b> within a few parsecs are a statistical model of the nuclear star cluster and
          disc: their numbers, brightness and colours follow published fits, but none is a real star except S2, S29, S38
          and S55. Stars fainter than those drawn, and any within 0.01 pc of you, are a smooth glow.{' '}
          <b>M87’s own starlight</b> round M87* is a smooth model of its measured light profile, not stars.
        </li>
        <li>
          <b>Not drawn:</b> the discs of hot gas of the X-ray binaries quiet between outbursts, the jets of Cygnus X-1, GRS 1915+105 and M87*, Cygnus X-1’s wind, V404 Cygni’s
          distant third star, and <b>the dust</b> near the black holes: the Sun seen from beyond Sgr A* would really be
          dimmed by some 30 magnitudes.
        </li>
        <li>
          <b>The classical view near a moving black hole</b> shows an observer at rest relative to the Sun, as the classical
          view does everywhere; hovering there differs by the hole’s speed, at most 0.19 % of <i>c</i> (Gaia BH3, 570 km/s).
        </li>
      </ul>
      <p>
        The full list is under{' '}
        <Ref page="about" to="limitations">
          Model limitations
        </Ref>{' '}
        on the About page.
      </p>

      <H3>Reading on</H3>
      <Reads list={OUT_THERE} />
    </Chapter>
  );
}

/** The rate steps, from clock.ts, in powers of ten and in words. */
function RateTable() {
  return (
    <table className="doc-tbl doc-tbl-narrow">
      <thead>
        <tr>
          <th>Rate</th>
          <th>One real second is</th>
        </tr>
      </thead>
      <tbody>
        {WARP_STEPS.map((w) => (
          <tr key={w}>
            <td className="doc-tbl-k">
              <P10 n={Math.round(Math.log10(w))} />
            </td>
            <td className="mono">{w === 1 ? '1 s (real time)' : formatDurationShort(w, 2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Time() {
  return (
    <Chapter
      id="time"
      n={chapterNo('time')}
      title="Time"
      lead="The simulation starts at the present moment and runs in real time. You can stop it, run it up to hundreds of millions of years a second, or jump to another date."
    >
      <H3>The date</H3>
      <p>
        The chip beside the name shows the instant being simulated, in UTC. It turns amber, with a dot, whenever that is not the
        present: while the clock is paused or running fast, and after a pause, a date you set or a flight, until <b>Now</b>{' '}
        brings it back. Point at it to see how exact the planets’ positions are at that date.
      </p>
      <p>
        Click it to type any date and time from 10,000 BCE to the end of 9999 (years −9999 to 9999 in astronomers’ numbering),
        or just a year: <i>1969</i>, <i>500 BCE</i>. Between 1700 and 2200 it also offers the next oppositions of Mars, Jupiter
        and Saturn, when each stands opposite the Sun in Earth’s sky and is near its closest. Press <b>Go to date</b> (or{' '}
        <Kbd>Enter</Kbd>): every body moves at once, both clocks on the instrument panel restart from zero and any light
        pulse still in flight is discarded. Spacecraft appear from their launch (Voyager 1 from 5 September 1977).
      </p>
      <KeyTable
        head={['Dates', 'Planet positions']}
        rows={[
          ['1700 to 2200', 'Precise: about an arcminute, checked against JPL’s DE405.'],
          ['3000 BCE to 3000 CE', 'Approximate: about half a degree, from JPL’s approximate orbital elements.'],
          ['Beyond', 'Illustrative: the orbits are right, the places along them are not.'],
        ]}
      />

      <H3>Rate</H3>
      <p>
        The rate is how much simulated time passes per real second. The arrows either side of it at the bottom left (or{' '}
        <Kbd>[</Kbd> and <Kbd>]</Kbd>, or <Kbd>,</Kbd> and <Kbd>.</Kbd>) step it from real time to{' '}
        {formatDurationShort(WARP_STEPS[WARP_STEPS.length - 1], 2)} a second, and it is written out in words, such as{' '}
        <i>2.8 h/s</i>. When time runs fast a lamp at the top of the view shows the power of ten and an amber border goes round
        the view. Journeys set the rate for you.
      </p>
      <RateTable />
      <p>
        However far time runs, the clock stays exact from the Big Bang, 13.8 billion years ago, to ten trillion years ahead;
        far from the present it simply advances in coarser steps.
      </p>

      <H3>The age of the universe</H3>
      <p>
        The clock is the universe’s clock too. Its date fixes the age of the universe, 13.8 billion years today, how far space
        has stretched since the Big Bang, and the temperature of the cosmic background radiation, from the standard model of
        cosmology with the Planck 2018 parameters. Run the clock billions of years ahead and the universe expands with it,
        whether or not you are flying, and a flight moves the clock on as it goes. The Local Group, held together by its own
        gravity, does not take part in the expansion. The bodies themselves do not age: more than ten million years from the
        present the Sun, the planets, the stars and the nebulae are still drawn as they are today. Their cards say so, and
        for times ahead they say what the Sun and the Earth will have become.
      </p>

      <H3>In flight</H3>
      <p>
        A flight plays by the clock on board. The same arrows then set how much of your time passes each second, shown as, say,{' '}
        <i>1 s = 3.4 months aboard</i>; the clock at home follows from the trip. By default any trip plays in about{' '}
        {Math.round(TRIP_PLAYBACK_S)} seconds, and never slower than real time on board. The fictional faster-than-light drive
        has no time on board, so it follows the ordinary rate.
      </p>

      <H3>Pause and Now</H3>
      <p>
        <Kbd>Space</Kbd> or <Kbd>P</Kbd> pauses and resumes (in Roam and the ship only <Kbd>P</Kbd>, since Space is up). <b>Now</b>{' '}
        (<Kbd>N</Kbd>) returns to the present at real time and restarts both clocks on the instrument panel from zero. It is
        unavailable during a flight and during a fall into a black hole: a traveller’s clock cannot be wound back. Close to a
        black hole it still sets the present date, but the clock cannot then keep pace with the computer’s, because your
        clock runs slow there (below).
      </p>

      <H3>Two clocks</H3>
      <p>
        Section B of the instrument panel holds two clocks. <i>t</i> is <i>coordinate time</i>, kept by clocks at rest relative
        to the Sun, far from any black hole. <i>τ</i> is <i>proper time</i>, kept by a clock travelling with you. Even while
        you orbit Earth, <i>τ</i> falls behind <i>t</i> by about 5 parts in <P10 n={9} />, because Earth carries you round the
        Sun at 30 km/s. In flight the difference grows to minutes, hours or years; near a black hole, gravity slows <i>τ</i>{' '}
        as well. <b>Zero</b> sets both clocks to zero.
      </p>

      <H3>Near a black hole</H3>
      <p>
        Gravity slows time. A clock hovering at a distance <i>r</i> from a black hole’s centre runs at √(1 − <i>r</i>
        <sub>s</sub>/<i>r</i>) of a clock far away, where <i>r</i>
        <sub>s</sub> is the radius of its horizon: at ten times that radius from Sagittarius A* at 0.9487 of home’s rate, so
        home’s clock runs 1.054 times faster than yours; one per cent above the horizon ten times faster; at the closest the
        camera goes, a thousand times. Within 5,000 horizon radii of a black hole (424 au from Sgr A*, 140,000 km from Gaia
        BH1) the difference passes a part in ten thousand, and the rate then paces <i>your</i> clock: one per cent above
        Sgr A*’s horizon the footer reads <i>1 s = 1 s here · 10 s at home</i> and the date turns amber. The chip at the
        bottom of the view says it in words, <i>your clock 10.05× slower</i>; its panel gives both clocks, and while the panel
        is open the lamp at the top of the view says how much faster home’s clock runs (<i>Home ×10.05</i>).
      </p>
      <p>
        On a circular orbit your clock runs slower still, by your speed as well (at the innermost stable orbit of Sgr A*,
        where you pass the hovering observers at half the speed of light, at 0.7071 of home’s rate). Falling in, home’s clock
        is shown on the clocks of observers falling freely beside you, a convention (<Ch to="flying" />).
      </p>
    </Chapter>
  );
}

function Flying() {
  return (
    <Chapter
      id="flying"
      n={chapterNo('flying')}
      title="Journeys and flights"
      lead="A flight is a physical journey: a straight line through space at 1 g or at a speed you choose, with clocks that obey relativity, and beyond the Local Group through space that expands as you go. Journeys are flights and scenes set up for you."
    >
      <H3>Journeys</H3>
      <p>
        <b>Journeys</b> in the header lists {countWord(JOURNEYS.length)} set pieces. Each is one click: the camera is placed, the clock is set, and a
        line says what to look for. Flights leave from Earth and show their predicted times, by Earth’s clocks and by yours,
        before you go.
      </p>
      <table className="doc-tbl">
        <thead>
          <tr>
            <th>Journey</th>
            <th>What happens</th>
          </tr>
        </thead>
        <tbody>
          {JOURNEYS.map((j) => (
            <tr key={j.id}>
              <td className="doc-tbl-k">{j.title}</td>
              <td>{j.sub}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <TryRow>
        <Try run={openJourneys}>Open the journeys</Try>
      </TryRow>

      <H3>Planning a flight</H3>
      <p>
        <b>Fly here</b> on a body’s card and <b>Fly</b> in Where to? open the flight planner set to a 1 g rocket to that body.{' '}
        <Kbd>G</Kbd> opens it for the selected body, with the drive and speed chosen last. You leave from wherever the camera is, and the planner aims at the
        point where the destination will be when you arrive, not where it is now. A flight ends a few radii from a planet, a
        moon or a star; to a galaxy, a cluster or a nebula it goes in almost to the centre, and the view then pulls back to show the
        whole of it. Press <b>Ignite</b> (or <b>Execute</b> for a constant speed) to go.
      </p>
      <TryRow>
        <Try run={planFlight('mars', 0.5)}>Plan a flight to Mars at 0.5c</Try>
      </TryRow>

      <H3>Three drives</H3>
      <KeyTable
        head={['Drive', 'What it does']}
        rows={[
          [
            'Flip-and-burn',
            'A rocket that accelerates at one Earth gravity (or at 0.1, 2 or 10 g, if you choose), turns round halfway and decelerates, arriving at rest. A real rocket could in principle fly this, and at 1 g the crew would feel their normal weight all the way. In expanding space the turn comes after the halfway point, since the expansion also slows the ship. You can set a limit on the time on board: a longer flight is refused.',
          ],
          [
            'Constant speed',
            'Jumps instantly to the chosen speed, coasts, and stops instantly on arrival. Idealised, but the clock readings between the jumps are exact. Through expanding space it cannot simply coast: it burns up to the speed at the chosen acceleration, holds it against the expansion, and brakes.',
          ],
          [
            <span key="w" className="!text-hazard">
              Superluminal (fiction)
            </span>,
            'Faster than light, for comparison only. The planner and the view are hatched in red and time on board is undefined.',
          ],
        ]}
      />

      <H3>Choosing a speed</H3>
      <p>
        Speeds are given as <i>β</i> = <i>v</i>/<i>c</i>. Type a value (0.9, or 0.999 99), drag the slider, or use a preset:
        Voyager 1 (16.9 km/s), the Parker Solar Probe (192 km/s), or 0.1 to 0.9999. The slider is spaced so that 0.9, 0.99 and
        0.999 are equally far apart, because most of relativity happens in the last few nines.
      </p>

      <H3>Predictions</H3>
      <p>
        Before you launch, the planner lists what the flight will involve: the path length; the time Δ<i>t</i> it takes by the
        Sun’s clocks; the time Δ<i>τ</i> that will pass on board; their difference; for the constant-speed drive, the length of
        the path as measured on the ship; and how long light would take over the same path. For rocket flights it adds the
        peak speed and the mass ratio a perfect photon rocket would need. The worldline preview plots the trip on a spacetime
        diagram in which light travels at 45°. Flights through expanding space have numbers of their own, and a plot of the
        two clocks in place of the worldline (below).
      </p>

      <H3>In flight</H3>
      <p>
        A panel along the bottom of the view shows where you are going, a progress bar and four big numbers: your <b>speed</b>{' '}
        as a fraction of <i>c</i>, with as many nines as it has, and the Lorentz factor <i>γ</i> under it; <b>your clock</b>,
        the time passed on board; the time passed <b>at home</b>, with the date there on long trips; and the distance still to
        go, with how long light would take to cover it. On a journey it also says what to look for.
      </p>
      <p>
        Drag to look around, or use <b>Ahead</b> and <b>Astern</b>. The arrows beside <i>1 s = …</i> set the pace (
        <Ch to="time" />). <b>Skip to arrival</b> advances the clocks to the end of the trip, and the readings stay
        exact. <b>Abort</b> stops the ship where it is (instantly, which no real ship could do). <b>Details</b> opens the full
        flight recorder: both clocks to more figures, their difference, the distance left measured in the Sun’s frame and in
        yours, a ruler of the path, and the optics. You can still select bodies and read their cards, but the camera stays with
        the ship.
      </p>
      <p>
        On arrival a card sums the trip up: for example, <i>Arrived at Saturn. The trip took 34 min for you and 1 h 18 min at
        home.</i> After a trip of a year or more at home it adds how much older you are and the date at home.
      </p>
      <p>
        Inside the Milky Way space is taken as static: the flights are special relativity, with no expansion of the universe to
        allow for (it does not stretch gravitationally bound systems). A 1 g flight to the black hole at the centre takes about
        20 years by your clock and about 27,000 years at home. The same holds within the Local Group: a 1 g flight to
        Andromeda takes about 29 years aboard and 2.5 million years at home. Farther out, the expansion of the universe matters.
        Flights ignore gravity, so the planner will not leave from within 30 horizon radii of a black hole, where it would
        matter: <i>Climb out first</i>. Arriving is fine.
      </p>
      <GuideFlightsBeyond />

      <H3>Near a black hole</H3>
      <p>
        Close to a black hole (within 5,000 horizon radii, where its gravity paces the clock, and never during a trip) a small
        chip along the bottom of the view names it and says how much slower your clock runs than home’s. Its <b>Details</b>{' '}
        opens the black-hole panel in the flight panel’s place, and <b>Hide</b> closes it again. The panel opens by itself for
        a black-hole scene or journey you start, and during a fall (so that <b>Stop the fall</b> is always in reach); to have
        it open by itself whenever you come close, turn on <b>View › Open the black-hole panel automatically</b> (it is
        remembered). The lens is drawn whatever the panel does. Hovering, the panel gives how much slower your clock runs than
        home’s, both clocks, your height above the horizon,
        the thrust hovering takes (3,806 g ten horizon radii from Sagittarius A*, 3.6 million g one per cent above its
        horizon) and the tides across a 2 m ship, with a gauge of height from the horizon to 10,000 horizon radii marked where
        light can circle the hole and at the innermost stable orbit. Where the tides would tear a ship apart it says so in
        red; hovering there is still allowed, as the physics of hovering is.
      </p>
      <p>
        Scenes use two more ways of moving. A <b>circular orbit</b> needs no engine: the innermost stable one, three horizon
        radii out, goes round Sagittarius A* in 23.0 minutes by your clock and 32.6 by home’s. A <b>snapshot</b> holds one
        moment still, the clock paused, and shows it as a ship passing at a given speed would see it. Any touch of the
        controls ends either.
      </p>
      <p>
        <b>Falling.</b> Hovering over a supermassive black hole (Sagittarius A* or M87*), the panel offers <b>Let go</b>:
        after one confirmation you fall freely from rest where you are, through the horizon. The journey <i>Fall into a
        black hole</i> drops you instead from ten horizon radii out as if from rest far away. The fall plays by your own
        clock, the stretch to twice the horizon’s radius in 20 s and the rest, to the end, in 80 s; at Sgr A* that last part
        is real time (the whole fall from ten horizon radii takes 864 s by your clock to the horizon and 28.2 s more to the
        end). <Kbd>[</Kbd> and <Kbd>]</Kbd> change the pace. The panel gives your clock, home’s, the radius, the time left
        and your speed past the hovering observers; inside the horizon, that nothing can hover. Nothing marks the crossing:
        the dark patch ahead is wider than the view, but the rest of the sky is still there round it. The fall ends where
        the tides pull a ship apart, 0.03 s before the centre. <b>Stop the fall</b> ends it at any time (<Kbd>Esc</Kbd> does
        not). Either way you are put back hovering where you let go, with home’s clock kept: nothing leaves a black hole, so
        this is a reset, not a journey. During a fall, journeys, scenes, dates and Now wait.
      </p>
      <p>
        Falls into the stellar-mass black holes are not offered: their tides would tear a ship apart 27 to 78 horizon radii
        out, long before it reached the horizon.
      </p>
      <TryRow>
        <Try run={() => runScene('fall-into-sgr-a-star')}>Fall into Sgr A*</Try>
        <Try run={() => runScene('isco-orbit')}>Orbit Sgr A* at the innermost stable orbit</Try>
      </TryRow>
      <Note title="Faster than light" tone="hazard">
        Nothing with mass can reach <i>c</i>: the energy needed grows without limit as <i>β</i> approaches 1. The superluminal
        drive exists to show why. During it the Lorentz factor is imaginary, time on board has no meaning, and some observers
        would reckon that you arrived before you left. <LearnLink slug="nothing-outruns-light">Why nothing outruns light</LearnLink>{' '}
        tells the story.
      </Note>
    </Chapter>
  );
}

/** The Learn articles about what you see, in the order to read them. */
interface Reading {
  slug: string;
  title: string;
  what: string;
}

const SEEING: Reading[] = [
  { slug: 'light-takes-time', title: 'Light takes time', what: 'Why nothing you see is current, and how the speed of light was first timed.' },
  { slug: 'how-big-is-the-solar-system', title: 'How big is the Solar System?', what: 'The scale of it all, and why the planets are specks at true scale.' },
  { slug: 'nothing-outruns-light', title: 'Why nothing outruns light', what: 'The Lorentz factor, the energy cost of each extra nine, and what faster than light would break.' },
  { slug: 'time-dilation', title: 'Time dilation is real', what: 'Why your clock falls behind Earth’s in flight, the twin paradox, and the experiments that prove it.' },
  { slug: 'seeing-near-light-speed', title: 'What you would see near the speed of light', what: `Aberration, the Doppler shift and beaming: the sky of Figure ${chapterNo('seeing')}.1.` },
  { slug: 'rockets-to-the-stars', title: 'Rockets to the stars', what: 'The 1 g flip-and-burn, and the fuel it would need.' },
  { slug: 'black-holes', title: 'Black holes', what: 'The shadow, the Einstein ring and the photon ring, clocks near the horizon, and what falling in would look like.' },
];

/** A list of Learn articles, each with a line on what it tells. */
function Reads({ list }: { list: readonly Reading[] }) {
  useArticles(); // the list follows the article index as articles are added
  return (
    <dl className="doc-dl">
      {list.map((a) => {
        const meta = findArticle(a.slug);
        return (
          <div key={a.slug}>
            <dt>{meta ? <LearnLink slug={a.slug}>{meta.title}</LearnLink> : <span className="text-fg-3">{a.title} (coming soon)</span>}</dt>
            <dd>{a.what}</dd>
          </div>
        );
      })}
    </dl>
  );
}

function Seeing() {
  return (
    <Chapter
      id="seeing"
      n={chapterNo('seeing')}
      title="What you are seeing"
      lead="Near the speed of light, and near a black hole, the sky and the clocks behave strangely, and every bit of it is real physics. Learn tells the full stories; this chapter points to them."
    >
      <Reads list={SEEING} />
      <TryRow>
        <button type="button" className="doc-try" onClick={() => openLearn()}>
          <span className="doc-try-k">Learn</span>
          <span className="doc-try-t">All the articles</span>
        </button>
      </TryRow>

      <H3>The sky in flight</H3>
      <p>
        Your motion tilts the light coming in, the way rain seems to come from ahead when you run through it. At 0.9<i>c</i> the
        whole forward half of the sky fits within 26° of the point you are heading for (Figure {chapterNo('seeing')}.1); at
        0.999<i>c</i>, within 2.6°. Light from ahead is shifted to the blue and brightened, and the sky behind fades to red. The
        glow of the Milky Way, the nebulae and the galaxies change in the same way as the stars.
      </p>
      <Fig
        n={`${chapterNo('seeing')}.1`}
        caption={
          <>
            Twenty-four stars spaced every 15° round a circle, seen at rest (left) and from a ship moving towards the top at{' '}
            <i>β</i> = 0.9 (right). Aberration gathers the forward half of the sky within arccos <i>β</i> = 25.8° of the apex.
            Colour shows the Doppler factor, blue for light shifted to higher frequency and red for lower; larger dots are
            brighter.
          </>
        }
      >
        <AberrationFigure beta={0.9} />
      </Fig>
      <p>
        <b>View › Optics</b> offers three models: <b>Relativistic</b>; <b>Classical</b>, which draws the sky as it is in the
        frame of an observer at rest (relative to the Sun; near a black hole, hovering there); and <b>Split</b> (
        <Kbd>X</Kbd>), with classical on the left and relativistic on the right of a divider you can drag. <Kbd>Z</Kbd>{' '}
        switches between classical and relativistic. All three look the same at rest: the difference appears in flight,
        above 0.01<i>c</i>. A black hole’s lens is not a matter of your speed, so it shows in all three, at rest too. To see
        the crowding on its own, turn off <i>Doppler shift and beaming</i> in section D of the instrument panel.
      </p>
      <TryRow>
        <Try run={() => useUI.setState({ relMode: 'split' })}>Split the view (for your next flight)</Try>
      </TryRow>

      <div id="doc-the-lens">
        <H3>The lens</H3>
        <p>
          A black hole bends the light that passes it, and Skyfold draws that bending exactly, for every star, every
          glow and every body in view, as it would be for a black hole that does not spin. Five things to look for:
        </p>
        <ul>
          <li>
            <b>The shadow.</b> Light aimed too close to the hole falls in, so a dark disc covers the part of the sky it would
            have come from. From far away it is 2.6 times the size the horizon would be if light went straight (Sagittarius
            A*’s is 53 millionths of an arcsecond across seen from Earth, about the size of the ring of light the Event
            Horizon Telescope imaged round it); close in it grows, to 28.5° across hovering ten horizon radii out, half the
            sky at one and a half, and all but a disc overhead just above the horizon.
          </li>
          <li>
            <b>The Einstein ring.</b> Whatever lies exactly behind the hole is spread into a ring round it. Everything else
            behind it is seen twice: once outside the ring, and once inside it, mirrored and fainter. Stars near the hole
            therefore appear in pairs on opposite sides of it (point at the second image of S2 and its label says it is bent
            round Sgr A*), and a body passing exactly behind, such as the Sun or S2, spreads into arcs and a ring. From
            4,000 au Sgr A*’s ring is 0.75° across; from ten horizon radii, 59.7°.
          </li>
          <li>
            <b>The photon ring.</b> Just outside the shadow’s edge a thin bright band holds light that went round the hole
            once, twice or more before reaching you: a whole copy of the sky in each, squeezed ever thinner. It is drawn with
            several rays a pixel so that it stays smooth.
          </li>
          <li>
            <b>The blueshift.</b> Hovering near a black hole you are held against its pull, and the light falling in to you
            gains energy: every star looks bluer and brighter, by the same factor home’s clock runs faster than yours (1.054
            ten horizon radii out, ten times one per cent above the horizon). The view dims itself to match, as a camera
            would, and dims further when the glowing gas fills it; section D of the instrument panel shows the exposure.
          </li>
          <li>
            <b>Your own motion</b> reshapes all of it, as it does the rest of the sky. Diving in at 0.9<i>c</i> the shadow
            ten horizon radii out shrinks from 28.5° to 6.6° across; climbing out at the same speed it swells to 114°.
          </li>
        </ul>
        <p>
          In the split view near a black hole the left half is labelled <i>HOVERING</i>, the view of an observer at rest
          there (near a moving black hole <i>AT REST (SUN)</i>, at rest relative to the Sun as everywhere else; during a fall{' '}
          <i>FALLING FROM REST</i>, the view of a raindrop falling from far away), and the right half{' '}
          <i>SHIP</i>, as seen from the ship: the lens shows in both. <b>View › Gravitational lensing</b> turns it off, and
          light is drawn straight: the black hole then cannot be seen. Only the black hole whose lens is largest where you are
          bends light; the others’ are then far below a pixel.
        </p>
        <p>
          Every black hole is drawn without spin, because no black hole’s spin is measured well enough to draw: a fast spin
          would make Sagittarius A*’s shadow about 5 to 7 % smaller as we see it and shift it by about half its horizon’s
          radius, and a shadow seen
          edge-on up to 12 % narrower, one side flattened (the full note is under What is a model, <Ch to="universe" />).
          Inside the shadow there is nothing: a black hole made by a collapsing star has no other side to see. On
          Sagittarius A*’s card, next to the Event Horizon Telescope’s own picture or a link to it, a switch draws the model
          of its gas at the EHT’s wavelength, 1.3 mm, in false colour, blurred to the EHT’s resolution if you ask: a model to
          compare, not the EHT’s image.
        </p>
        <TryRow>
          <Try run={() => runScene('sgr-a-star-einstein-ring')}>See Sgr A*’s Einstein ring</Try>
          <Try run={() => runScene('photon-ring')}>See the photon ring</Try>
        </TryRow>
      </div>
      <p>
        With <b>View › Physics hints</b> on, a note in the corner points to the right article the first time each of these
        things happens. <b>View › Physics reference</b> sets out the same physics in short sections, each with its equation,
        in a panel on the left.
      </p>
      <TryRow>
        <Try run={openReference}>Open the physics reference</Try>
      </TryRow>
    </Chapter>
  );
}

function Readings() {
  return (
    <Chapter
      id="readings"
      n={chapterNo('readings')}
      title="Readings"
      lead="The card tells you about a body; the instrument panel gives every number, several times a second. Open it from View › Instrument panel, from Details on a card, or with I. Its sections are lettered; click a heading to fold it."
    >
      <table className="doc-tbl">
        <thead>
          <tr>
            <th>Section</th>
            <th>What it shows</th>
          </tr>
        </thead>
        <tbody>
          {(
            [
              ['A', 'Observer', 'Your distance from the Sun and your direction; speed v and β = v/c; the Lorentz factor γ; rapidity; how fast your clock runs; kinetic energy per kilogram. Near a black hole also whom your motion is measured against (the observers hovering there, or in a fall those falling from far away), your height above the horizon, the gravitational rate α of a hovering clock, your speed past the hovering observers, the thrust your motion takes and the tides.'],
              ['B', 'Chronometers', `Coordinate time t, your proper time τ, their difference and their ratio (Chapter ${chapterNo('time')}).`],
              ['C', 'Target', 'For the selected body: range, light-time, range rate, angular size and brightness; in motion, its angle from the apex in both frames and its Doppler factor; physical data and a short description. Buttons slew the camera, plan a flight, or emit a light pulse from the body.'],
              ['D', 'Relativistic optics', 'Whether the relativistic view is active; the Doppler factor ahead, abeam and astern; the angle within which the forward half of the sky appears; the colour temperature of the Sun if it lay dead ahead; the reticle’s spectrometer reading; the automatic exposure whenever it is not zero (near a black hole, at rest too).'],
              ['E', 'Light-time', 'How old your view of Earth is, how long a signal to Earth would take, and how long ago the sunlight reaching you left the Sun.'],
              ['F', 'Spacetime diagram', 'In flight through static space only: your worldline, with ticks of ship time and your current line of simultaneity.'],
              ['G', 'Ephemeris', 'The distance from the Sun and from you, and the light-time, of the Sun, the planets, Pluto, the Moon, Voyager 1, the stars of the named systems, the moons of the system in view, and the target. Click a row to select the body.'],
              ['H', 'Strip-chart recorder', 'The last 30 seconds of β, γ, the Doppler factor ahead, the clock rate, or range.'],
            ] as const
          ).map(([k, name, text]) => (
            <tr key={k}>
              <td className="doc-tbl-k whitespace-nowrap">
                <span className="mono mr-2 text-accent">{k}</span>
                {name}
              </td>
              <td>{ital(text)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <TryRow>
        <Try run={() => useUI.setState({ rightOpen: true })}>Open the instrument panel</Try>
      </TryRow>

      <H3>In the view</H3>
      <KeyTable
        rows={[
          ['Body card', 'Top right, for the selected body: what it is, its range and light-time, three facts, and Go there, Fly here, Read and Details. For a black hole, your height above its horizon instead of the range, and what it looks like from here: the shadow’s and the Einstein ring’s size, how much slower your clock runs, the thrust hovering takes. × closes it; the next selection brings it back.'],
          ['Flight panel', <>Along the bottom in flight: speed, your clock, the clock at home and the distance left (<Ch to="flying" />).</>],
          ['Black-hole chip and panel', <>Along the bottom close to a black hole: the chip says how much slower your clock runs; its Details opens the panel of clocks, height, thrust and tides (<Ch to="flying" />).</>],
          ['Roam’s panel', <>Top left while you roam: the nearest thing and how far it is, the pace in plain words, and the switch to the ship (<Ch to="looking" />).</>],
          ['Reticle', <>In motion, marks the centre of the view. Its spectrometer reads the angle <i>θ</i>′ from the apex and the Doppler factor <i>D</i> there.</>],
          ['APEX, ANTAPEX', 'The directions you are heading towards and away from.'],
          ['Scale bar', 'A length at the distance of the body named beside it. In the relativistic view it reads “no single scale at this speed”, and close to a black hole “no single scale near a black hole”, since the scale then varies across the sky.'],
          ['Axis triad', 'The ecliptic axes, X towards the March equinox and Z towards ecliptic north. Shown with the grid.'],
          ['Camera readout', 'What the camera is doing and its range to the target.'],
        ]}
      />
      <p>
        <b>View › Readouts over the view</b> (<Kbd>U</Kbd>) shows or hides the reticle, markers, scale bar and camera readout.
      </p>
    </Chapter>
  );
}

function Controls() {
  return (
    <Chapter
      id="controls"
      n={chapterNo('controls')}
      title="Keyboard and mouse"
      lead="Single-key shortcuts work whenever you are not typing in a field. Press ? at any time for this list on one sheet. If the keys clash with assistive software, turn them off in View › Single-key shortcuts (or on the keys sheet); Ctrl+K still opens Where to?."
    >
      <div className="doc-keygrid">
        {KEY_GROUPS.map((g) => (
          <div key={g.title}>
            <h4>{g.title}</h4>
            <KeyTable rows={g.rows} />
          </div>
        ))}
      </div>
      <H3>Using the keyboard alone</H3>
      <p>
        <Kbd>Tab</Kbd> moves between controls. Within a set of options, such as the optics models, the arrow keys move the
        choice. In Where to?, the arrow keys move through the list. <Kbd>Esc</Kbd> closes menus, dialogs and this guide. A panel
        edge takes focus too: the arrow keys resize it, and <Kbd>Home</Kbd> resets it.
      </p>
    </Chapter>
  );
}

function Troubleshooting() {
  const faq: [string, ReactNode][] = [
    [
      'The view is black',
      <>
        Skyfold needs WebGL 2. Check that hardware acceleration is on in your browser’s settings, update the browser, and
        reload. On a laptop, plugging in the charger lets the graphics chip run at full speed.
      </>,
    ],
    [
      'It is slow or jerky',
      <>
        The program lowers its resolution by itself to keep the frame rate up. It also helps to close other tabs, turn off
        small bodies (<Kbd>B</Kbd>), and use classical optics in flight: the relativistic view draws the scene six times per
        frame, once for each face of a cube. <b>View › Performance readout</b> shows the frame rate.
      </>,
    ],
    [
      'It is slow near a black hole',
      <>
        The lens is the costliest thing Skyfold draws. Near a black hole a controller watches how long the graphics chip
        takes over each frame, and while that stays above about 8.5 ms it steps down: fewer rays in the photon ring, fewer of
        the stars round Sagittarius A* drawn one by one (the rest join their glow, so the light stays the same), and plainer
        pictures of the sky, and only then a lower resolution. On Windows, Chrome’s default graphics backend is the fastest:
        switched to Vulkan (<i>Choose ANGLE graphics backend</i> in chrome://flags) these views run 2.3 to 2.8 times slower
        on an integrated GPU.
      </>,
    ],
    [
      'The black hole is not there',
      <>
        On a first visit the lens appears a few seconds after the page has loaded, once its shaders have been prepared in
        the background. If it still does not, check <b>View › Gravitational lensing</b> (it starts on at every visit). From
        far away a black hole’s lens is smaller than a pixel: Sagittarius A*’s is drawn from within about 720 parsecs, Gaia
        BH1’s from within 320 au.
      </>,
    ],
    [
      'The sky near Sagittarius A* is bright grey',
      <>
        It really is that bright there: the nuclear star cluster surrounds the black hole with a glow and thousands of stars
        far brighter than any in Earth’s sky. The view is stopped down for that glare, as a camera would be (the
        instrument panel’s Auto-exposure row shows by how much), so the sky shows grey and faint things in it (the Sun’s
        ring seen from beyond the hole) can barely be picked out.
      </>,
    ],
    [
      'Everything on screen has gone',
      <>
        That is clean full screen: <Kbd>Esc</Kbd> or <Kbd>Shift</Kbd>+<Kbd>F</Kbd> brings the interface back, just as it was.
      </>,
    ],
    [
      'Where is the black-hole panel?',
      <>
        Close to a black hole it waits behind the small chip at the bottom of the view: press <b>Details</b> there. To have it
        open by itself, turn on <b>View › Open the black-hole panel automatically</b>.
      </>,
    ],
    [
      'Roam is too slow, or too fast',
      <>
        Scroll, or press <Kbd>+</Kbd> and <Kbd>−</Kbd>, to change the pace (the panel shows it, ×1 by default); hold{' '}
        <Kbd>Shift</Kbd> for {countWord(ROAM_BOOST)} times the pace for a moment.
      </>,
    ],
    [
      'I can’t stop falling',
      <>
        Press <b>Stop the fall</b> on the panel at the bottom of the view; <Kbd>Esc</Kbd> does not end a fall. You are put
        back hovering where you let go.
      </>,
    ],
    [
      'The planner says “Climb out first”',
      <>
        Flights ignore gravity, so the planner will not leave from within 30 horizon radii of a black hole. Scroll out, or
        take the camera to another body, and plan the flight from there.
      </>,
    ],
    [
      'I can’t see any planets',
      <>
        At true scale they are smaller than a pixel. Look for their labels, or press <Kbd>T</Kbd> for enlarged bodies. If the
        labels are off, press <Kbd>L</Kbd>.
      </>,
    ],
    [
      'I can’t see the galaxies',
      <>
        Seen from far off most galaxies are too faint to see, as they would be to the eye. Go closer (<b>Where to?</b> finds
        any of them by name), or turn on <b>View › Cosmic web</b> to see where they are as a map.
      </>,
    ],
    [
      'I’m lost',
      <>
        <Kbd>H</Kbd> takes the camera back to Earth, <b>Solar System</b> at the bottom of the screen shows the whole system, and{' '}
        <Kbd>N</Kbd> sets the clock back to the present. <Kbd>Esc</Kbd> (or <Kbd>F</Kbd>) leaves Roam, and the camera orbits the
        nearest thing. A journey always starts from a known place.
      </>,
    ],
    [
      'The date is amber',
      <>
        It is not the present: the clock is paused, running fast, set to another date, or behind after a pause or a flight.
        Press <Kbd>N</Kbd> (or <b>Now</b>) to come back.
      </>,
    ],
    [
      'A journey will not start',
      <>
        Journeys wait until you are not in flight: finish the current trip with <b>Skip to arrival</b>, or <b>Abort</b> it, on
        the flight panel.
      </>,
    ],
  ];
  return (
    <Chapter id="troubleshooting" n={chapterNo('troubleshooting')} title="Troubleshooting" lead="Common problems and what to do about them.">
      {faq.map(([q, a]) => (
        <div key={q}>
          <H3>{q}</H3>
          <p>{a}</p>
        </div>
      ))}
      <H3>Starting again</H3>
      <p>
        The button below resets the layout, the display settings and the welcome screen, and reloads the page.
      </p>
      <TryRow>
        <button
          className="btn"
          onClick={() => {
            if (window.confirm('Reset the layout and preferences and reload?')) resetPreferences();
          }}
        >
          Reset layout and preferences
        </button>
      </TryRow>
    </Chapter>
  );
}

const GLOSSARY: [ReactNode, ReactNode][] = [
  ['Aberration', 'The change in the apparent direction of light caused by the observer’s motion.'],
  ['Accretion flow', 'The gas falling into a black hole. Sagittarius A*’s is hot, thin and faint; in Skyfold it is a model fitted to its spectrum.'],
  ['Apex, antapex', 'The points on the sky towards which, and away from which, the observer is moving.'],
  ['Astronomical unit (au)', 'A defined length, 149,597,870.7 km, close to the mean distance from Earth to the Sun: about 8 minutes 19 seconds of light-time.'],
  [<><i>β</i> (beta)</>, <>Speed as a fraction of the speed of light, <i>v</i>/<i>c</i>.</>],
  ['Beaming', 'The brightening of light from ahead, and dimming of light from behind, seen by a fast observer.'],
  ['Comoving distance', 'The distance between two galaxies carried along by the expansion, with the expansion taken out: their distance at any moment divided by the scale factor then. Today it is their distance now.'],
  [<>Coordinate time, <i>t</i></>, 'Time kept by clocks at rest in the Sun’s frame S: the clock “at home”.'],
  ['Cosmic event horizon', 'The distance beyond which light sent today will never arrive, because the expansion of the universe is speeding up: about 16.6 billion light-years. No ship can reach anything beyond it. Not to be confused with a black hole’s event horizon.'],
  ['Cosmic microwave background (CMB)', 'The oldest light there is, set free about 370,000 years after the Big Bang and stretched since into microwaves; it fills the sky at 2.725 K.'],
  ['Cosmic time', 'Time since the Big Bang, as kept by clocks at rest in the expanding universe: 13.8 billion years today. On flights through expanding space it is the clock at home.'],
  ['Cosmic web', 'The pattern of galaxies on the largest scales: walls and filaments round nearly empty voids.'],
  [<>Doppler factor, <i>D</i></>, <>The ratio of observed to emitted frequency. <i>D</i> greater than 1 is a blueshift.</>],
  ['Ecliptic', 'The plane of Earth’s orbit, and the circle it traces on the sky; the reference plane for the coordinates used here.'],
  ['Einstein ring', 'The ring into which a black hole (or any mass) spreads the light of what lies exactly behind it. Everything else behind it is seen twice, once outside the ring and once, mirrored, inside it.'],
  ['Epoch', 'The instant being simulated: the date on the chip in the header.'],
  ['Event horizon', <>A black hole’s point of no return: a sphere of radius <i>r</i><sub>s</sub> = 2<i>GM</i>/<i>c</i><sup className="sup">2</sup> for one that does not spin (12.7 million km for Sagittarius A*, 27 km for Gaia BH1). Nothing inside it can get out, or even stay where it is.</>],
  ['Frame, S and S′', 'S is the rest frame of the Sun; S′ is the frame moving with the observer.'],
  [<><i>γ</i> (gamma), Lorentz factor</>, <>1/√(1 − <i>β</i><sup className="sup">2</sup>): the factor by which moving clocks run slow and moving lengths contract.</>],
  ['Gravitational lensing', 'The bending of light by gravity, which moves, brightens, doubles and rings the images of what lies behind a mass.'],
  ['Gravitational time dilation', <>The slowing of clocks by gravity: a clock hovering at <i>r</i> from a black hole runs at √(1 − <i>r</i><sub>s</sub>/<i>r</i>) of one far away.</>],
  ['Hovering observer', 'An observer held at a fixed distance from a black hole by a rocket. Near a black hole Skyfold measures your motion against them.'],
  ['Journey', `One of the ${countWord(JOURNEYS.length)} set pieces under Journeys: a flight from Earth, or a scene with the clock set, with a line on what to look for.`],
  [<>Lambda-CDM (<i>Λ</i>CDM)</>, 'The standard model of cosmology: a flat universe of ordinary matter, cold dark matter and dark energy in the form of a cosmological constant, Λ. Skyfold uses it with the values measured by the Planck satellite (2018).'],
  ['Light-time', 'How long light takes to cover a given distance.'],
  ['Light-year (ly)', <>The distance light travels in a Julian year, 9.46 × 10<sup className="sup">12</sup> km.</>],
  ['Local Group', 'The Milky Way, Andromeda, Triangulum and dozens of smaller galaxies, held together by gravity within about a megaparsec; inside it space does not expand.'],
  ['Opposition', 'The time when a planet stands opposite the Sun in Earth’s sky, near its closest to Earth.'],
  ['Parsec (pc)', 'The distance at which one astronomical unit spans one second of arc: 3.26 light-years. A kiloparsec (kpc) is a thousand parsecs, a megaparsec (Mpc) a million.'],
  ['Photon ring', 'A thin band just outside a black hole’s shadow holding light that went round the hole once or more on its way to you: squeezed copies of the whole sky, one inside the next.'],
  [<>Proper time, <i>τ</i> (tau)</>, 'Time kept by a clock travelling with the observer: “your clock”.'],
  ['Raindrop', 'An observer falling freely into a black hole from rest far away. Its view stays regular through the horizon; Skyfold shows a fall from its frame, and home’s clock on its clocks.'],
  [<>Rapidity, <i>φ</i> (phi)</>, <>artanh <i>β</i>: a measure of speed that adds simply for successive boosts along a line, and grows in proportion to proper time at constant acceleration.</>],
  [<>Redshift, <i>z</i></>, <>How much light has been stretched on its way: 1 + <i>z</i> is the wavelength received over the wavelength sent. For distant galaxies most of it is the expansion of space.</>],
  ['Roam', 'The camera flown by hand, with nothing in focus and no speed limit: its pace is the distance to the nearest thing that matters, per second. A camera, not a ship: no relativity applies to its motion.'],
  [<>Scale factor, <i>a</i></>, 'How far space has stretched: distances between galaxies far apart grow in proportion to it. It is 1 today.'],
  ['Shadow (of a black hole)', 'The dark patch a black hole makes on the sky: the directions from which no light can reach you, because light aimed there falls in. Seen from far away it is 2.6 times the size of the horizon.'],
  ['Simulation rate', <>Simulated seconds per real second, from 1 to {rich(`10${superscript(Math.round(Math.log10(WARP_STEPS[WARP_STEPS.length - 1])))}`)}.</>],
  ['True scale', 'Every body drawn at its real size and at its real distance.'],
  ['Worldline', 'The path of an object through spacetime.'],
];

function Glossary() {
  return (
    <Chapter id="glossary" n={chapterNo('glossary')} title="Glossary">
      <dl className="doc-dl">
        {GLOSSARY.map(([t, d], i) => (
          <div key={i}>
            <dt>{t}</dt>
            <dd>{d}</dd>
          </div>
        ))}
      </dl>
      <p className="doc-end">
        Questions or corrections? See <Ref page="about" to="author">the About page</Ref> for how to get in touch.
      </p>
    </Chapter>
  );
}

/** The featured destinations, named as in Where to?, for the guide's opening line. */
function featuredNames(): string {
  const names = FEATURED_IDS.map((id) => findDestination(id)?.name).filter(Boolean) as string[];
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : (names[0] ?? '');
}

export default function GuideDoc() {
  return (
    <>
      <header className="doc-mast">
        <div className="doc-mast-k">Guide</div>
        <h1>Exploring with Skyfold</h1>
        <p>
          How to look around, fly and find your way, from the Moon to the cosmic web, and what everything on the screen does.
        </p>
      </header>
      <Welcome />
      <QuickStart />
      <Screen />
      <Looking />
      <Universe />
      <Time />
      <Flying />
      <Seeing />
      <Readings />
      <Controls />
      <Troubleshooting />
      <Glossary />
    </>
  );
}

