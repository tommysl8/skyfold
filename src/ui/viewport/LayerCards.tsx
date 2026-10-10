/**
 * The cards of the data layers, in the top left of the view while they show (in the column there,
 * below the view readout or Roam's panel and the messages: ViewportChrome.tsx): the map of the
 * cosmic microwave background (its label, "contrast enhanced", and its credit), the cosmic web
 * (what the points are, and the survey's gaps), the galaxy surveys (placed by redshift), the asteroids and comets (how good
 * their Kepler orbits are: ui/asteroidCard.ts), and near Sagittarius A* the two models there: the
 * stars round it (a statistical model of the nuclear star cluster and disc, its text in
 * sim/galaxy/nuclearCluster.ts) and the glowing gas falling into it (the accretion flow's model,
 * sim/blackholes/accretion.ts), and the Milky Way's magnetic field (its model's lines in 3D, or the field over the sky
 * measured from the Solar System: sim/galaxy/fieldView.ts), and the dark-matter layer while it is on (what of it shows,
 * with the Milky Way's rotation curve in a small chart: DarkMatterChart.tsx, a chunk of its own), and a card for each
 * coronal mass ejection in view (up to two: sim/spaceWeather/cards.ts). Each says what the layer is and whether it is a model; each opens to say
 * more, keeps its credits and references under Sources (closed: Sources.tsx), and shows whenever its layer does,
 * unless it has been put away with its Hide: that hides the note only, never the layer (the View menu turns layers on
 * and off), and is remembered between visits until View › Layer notes brings the notes back (state/ui.ts hiddenNotes).
 *
 * Cost: a few comparisons twice a second, and the flow's point once (a microsecond, nothing
 * allocated).
 */
import { lazy, Suspense, useState, type ReactNode } from 'react';
import { openLearn } from '../../state/route';
import { useUI } from '../../state/ui';
import { sim } from '../../sim/sim';
import { relView } from '../../render/relativisticView';
import { useTicker } from '../useTicker';
import { CMB_CARD, COSMIC_WEB_CARD, cosmicWebShare, quaiaShare, SURVEY_CARD, surveyShare, webMembersShown } from '../cosmicLayers';
import { quaia, survey } from '../../sim/surveys/load';
import { cmbEpochNote } from '../../sim/cosmos/cmb';
import { NSC_LAYER_CARD, nuclear } from '../../sim/galaxy/nuclearCluster';
import { FLOW_HOLE, flowPoint, type FlowPoint } from '../../sim/blackholes/accretion';
import { kindArticle } from '../../content/bodyArticles';
import { SourceLinks, Sources } from './Sources';
import { ASTEROID_CARD, asteroidCardShown } from '../asteroidCard';
import { smallBodies } from '../../sim/asteroids/load';
import { SATELLITE_CARD, satelliteCardLines } from '../satelliteCard';
import { FIELD_CARD, FIELD_SKY_SOURCE, FIELD_SKY_TEXT, fieldShares } from '../../sim/galaxy/fieldView';
import { cmeCardsNow } from '../../sim/spaceWeather';

/** The Learn note on space weather. */
const SPACE_WEATHER_ARTICLE = 'space-weather';
import { DARK_CARD, darkLayer } from '../../sim/galaxy/darkLayer';

/** The rotation curve's chart, with the mass model it plots: loaded once the dark-matter card first shows it. */
const DarkMatterChart = lazy(() => import('./DarkMatterChart'));

/** The web's card shows once this much of the layer shows. */
const WEB_CARD_SHARE = 0.3;

/** The magnetic field's card shows once either of its pictures shows this much. */
const FIELD_CARD_SHARE = 0.1;

/** The Learn article both the web and the CMB map belong to. */
const COSMOS_ARTICLE = 'the-expanding-universe';

/**
 * The gas's card shows while its point is brighter than this (V; about 0.2 pc from Sgr A*, where it is already
 * brighter than any star in Earth's sky), and while it is resolved (drawn by the lens, with lensing on).
 */
const FLOW_CARD_MAG = -6;

/** The accretion flow's card (labels 12 and 13 of docs/data/blackholes.md §3). */
export const FLOW_LAYER_CARD = {
  title: 'The gas round Sgr A*',
  line: 'A model of the hot gas falling into the black hole, bent round its shadow by the lens and brightest where the gas comes towards you.',
  caveat: 'Never seen in visible light: its brightness is uncertain about three times either way, and it is smooth where the real flow flickers.',
  more: [
    'The model: a hot, thin flow fitted to Sgr A*’s spectrum from radio waves to the near infrared, and turned like the flares seen near the black hole (a model choice). It is drawn outside the horizon only.',
    'Its visible light is carried over from the infrared, since some 30 magnitudes of dust hide Sgr A* from us in visible light: about three times brighter or fainter either way, and eight times fainter in a pessimistic model. The real flow flickers tenfold within hours; this one is steady.',
    'On Sgr A*’s card: the same model at 1.3 mm, as the Event Horizon Telescope sees it, next to the EHT’s own picture or a link to it. The scenes made to show the lens switch the gas off, and say so.',
  ],
  sources: ['A hot, thin flow of the kind Broderick and Loeb described (2006), turned like the flares GRAVITY saw near the black hole.'],
} as const;

function LayerCard({
  title,
  line,
  caveat,
  note,
  figure,
  more,
  sources,
  links = [],
  article,
  onClose,
  closeTitle = 'Hide this note: the layer stays (the View menu turns layers off; View › Layer notes brings notes back)',
}: {
  title: string;
  line: string;
  caveat?: string;
  /** A line more under the caveat, for a part of the layer that shows only at times. */
  note?: string;
  /** A small figure under the lines. */
  figure?: ReactNode;
  more: readonly string[];
  /** Its credits and references, under Sources, and links among them. */
  sources: readonly string[];
  links?: readonly { url: string; label: string }[];
  /** The Learn article it belongs to, when there is one. */
  article?: string;
  onClose: () => void;
  closeTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="pointer-events-auto w-full rounded bg-bg/85 px-2.5 py-1.5 text-[11px] leading-[15px] text-fg-2 backdrop-blur-sm" aria-label={title}>
      <div className="flex items-baseline gap-2">
        <h2 className="text-[11.5px] font-medium text-fg">{title}</h2>
        <button className="btn btn-q btn-sm ml-auto !px-1 !py-0 text-[10.5px]" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? 'Less' : 'More'}
        </button>
        {article && (
          <button className="btn btn-q btn-sm !px-1 !py-0 text-[10.5px]" onClick={() => openLearn(article)} title="Read about it in Learn">
            Read
          </button>
        )}
        <button className="btn btn-q btn-sm !px-1 !py-0 text-[10.5px]" onClick={onClose} title={closeTitle}>
          Hide
        </button>
      </div>
      <p>{line}</p>
      {caveat && <p className="mt-0.5 text-fg-3">{caveat}</p>}
      {note && <p className="mt-0.5 text-fg-3">{note}</p>}
      {figure}
      {open && more.map((m) => <p key={m} className="mt-1 text-fg-3">{m}</p>)}
      {sources.length > 0 && (
        <Sources className="mt-1">
          {sources.map((s) => (
            <p key={s}>{s}</p>
          ))}
          <SourceLinks links={links} />
        </Sources>
      )}
    </section>
  );
}

/** Put a layer's note away (remembered between visits); its layer stays as it is. */
const hideNote = (key: string) => useUI.setState((s) => ({ hiddenNotes: s.hiddenNotes.includes(key) ? s.hiddenNotes : [...s.hiddenNotes, key] }));

/** The flow's point this tick (reused). */
const flowNow: FlowPoint = { magnitude: 99, spectralIndex: -0.5, rgb: [1, 1, 1], pointShare: 1 };

export function LayerCards() {
  useTicker(2);
  const showCmb = useUI((s) => s.showCmb);
  const webMode = useUI((s) => s.cosmicWeb);
  const surveysMode = useUI((s) => s.surveys);
  const flowOn = useUI((s) => s.accretionFlow);
  const beltsOn = useUI((s) => s.showBelts);
  const satsOn = useUI((s) => s.satellites);
  const fieldOn = useUI((s) => s.fieldLines);
  const cmesOn = useUI((s) => s.cmes);
  const hidden = useUI((s) => s.hiddenNotes);
  const darkOn = useUI((s) => s.darkMatter);
  const away = (key: string) => hidden.includes(key);
  // The satellites' note while their switch is on near Earth, saying why they are hidden when they are.
  const sats = away('sats') ? null : satelliteCardLines(satsOn);
  const belts = !away('belts') && asteroidCardShown(beltsOn);
  // Shown whatever the readouts setting: the label and caveats belong with the layers.
  const web = !away('web') && (cosmicWebShare(webMode, sim.camera.pos.length()) >= WEB_CARD_SHARE || webMembersShown.now);
  // The surveys' card once they show (and their index has loaded).
  const surveys = !away('surveys') && !!survey.hierarchy && surveyShare(surveysMode, sim.camera.pos.length()) >= WEB_CARD_SHARE;
  // Its line on Quaia once Quaia's quasars show too.
  const quaiaShown = !!quaia.hierarchy && quaiaShare(surveysMode, sim.camera.pos.length()) >= WEB_CARD_SHARE;
  // The map is drawn in the plain view (and the plain half of the split view).
  const cmb = !away('cmb') && showCmb && (!relView.active || relView.split);
  // The nuclear cluster's field while its points are drawn (within 60 pc of Sgr A*, once loaded).
  const nsc = !away('nsc') && nuclear.w > 0 && nuclear.points > 0;
  // The gas while it is drawn and conspicuous: its point bright, or resolved by the lens (flowPoint: 99 when not drawn).
  const flow = !away('flow') && flowOn && flowPoint(FLOW_HOLE, flowNow).magnitude < FLOW_CARD_MAG;
  // The Galaxy's field: which of its two pictures shows (the lines away from the Solar System, the sky's near it).
  const field = fieldOn && !away('field') ? fieldShares(sim.camera.pos) : null;
  const fieldSky = !!field && field.sky >= FIELD_CARD_SHARE && (!relView.active || relView.split);
  const fieldLines = !!field && field.lines >= FIELD_CARD_SHARE;
  // The CMEs whose fronts are drawn now (sim/spaceWeather), up to two.
  const cmes = cmesOn && !away('cme') ? cmeCardsNow() : [];
  // The dark-matter layer while it is on; its chart while the halo and the tracers show.
  const dark = !away('dark') && darkOn;
  const darkHalo = darkLayer.tracers > 0.3;
  const darkBullet = darkLayer.bullet > 0.3;
  if (!web && !surveys && !cmb && !nsc && !flow && !belts && !fieldSky && !fieldLines && !sats && !dark && cmes.length === 0) return null;
  const holeArticle = kindArticle('black-hole');
  return (
    <div className="flex w-full max-w-[380px] flex-col gap-1.5">
      {cmb && (
        <LayerCard
          title={CMB_CARD.title}
          line={CMB_CARD.line}
          caveat={cmbEpochNote()}
          more={[CMB_CARD.key, CMB_CARD.caveat]}
          sources={[`${CMB_CARD.credit}.`]}
          article={COSMOS_ARTICLE}
          onClose={() => hideNote('cmb')}
        />
      )}
      {cmes.map((c, i) => (
        <LayerCard
          key={`${i}:${c.title}`}
          title={c.title}
          line={c.line}
          caveat={c.caveat}
          more={c.more}
          sources={c.sources}
          links={c.link ? [{ url: c.link, label: 'The CME in DONKI' }] : []}
          article={SPACE_WEATHER_ARTICLE}
          onClose={() => hideNote('cme')}
        />
      ))}
      {(fieldLines || fieldSky) && (
        <LayerCard
          title={FIELD_CARD.title}
          line={fieldSky ? FIELD_SKY_TEXT[FIELD_SKY_SOURCE].line : FIELD_CARD.lines}
          caveat={fieldSky ? 'Measured: the field’s direction across the line of sight, not which way it points, faint and contrast limited.' : FIELD_CARD.linesCaveat}
          more={FIELD_CARD.more}
          sources={fieldSky ? [`${FIELD_SKY_TEXT[FIELD_SKY_SOURCE].credit}.`, ...FIELD_CARD.sources] : FIELD_CARD.sources}
          article="our-galaxy"
          onClose={() => hideNote('field')}
        />
      )}
      {belts && (
        <LayerCard
          title={ASTEROID_CARD.title}
          line={ASTEROID_CARD.line(smallBodies.index?.total ?? 0)}
          caveat={ASTEROID_CARD.caveat}
          more={ASTEROID_CARD.more}
          sources={[ASTEROID_CARD.credit]}
          onClose={() => hideNote('belts')}
        />
      )}
      {sats && (
        <LayerCard
          title={SATELLITE_CARD.title}
          line={sats.line}
          caveat={sats.caveat}
          more={SATELLITE_CARD.more}
          sources={[SATELLITE_CARD.credit]}
          onClose={() => hideNote('sats')}
        />
      )}
      {web && (
        <LayerCard
          title={COSMIC_WEB_CARD.title}
          line={COSMIC_WEB_CARD.line}
          caveat="A survey, not a census: gaps in the southern galactic sky and behind the Milky Way are partly the survey’s."
          more={[COSMIC_WEB_CARD.key, COSMIC_WEB_CARD.caveat]}
          sources={[`${COSMIC_WEB_CARD.credit}.`]}
          article={COSMOS_ARTICLE}
          onClose={() => hideNote('web')}
        />
      )}
      {surveys && (
        <LayerCard
          title={SURVEY_CARD.title}
          line={SURVEY_CARD.line}
          caveat={SURVEY_CARD.caveat}
          note={quaiaShown ? SURVEY_CARD.quaia : undefined}
          more={SURVEY_CARD.more}
          sources={[`${SURVEY_CARD.credit}.`]}
          article={COSMOS_ARTICLE}
          onClose={() => hideNote('surveys')}
        />
      )}
      {flow && (
        <LayerCard
          title={FLOW_LAYER_CARD.title}
          line={FLOW_LAYER_CARD.line}
          caveat={FLOW_LAYER_CARD.caveat}
          more={FLOW_LAYER_CARD.more}
          sources={FLOW_LAYER_CARD.sources}
          article={holeArticle}
          onClose={() => hideNote('flow')}
        />
      )}
      {dark && (
        <LayerCard
          title={DARK_CARD.title}
          line={DARK_CARD.line}
          caveat={darkBullet ? DARK_CARD.bullet : darkHalo || darkLayer.halo > 0.3 ? DARK_CARD.halo : DARK_CARD.elsewhere}
          figure={
            darkHalo ? (
              <Suspense fallback={null}>
                <DarkMatterChart />
              </Suspense>
            ) : undefined
          }
          more={DARK_CARD.more}
          sources={DARK_CARD.sources}
          article={darkBullet ? 'island-universes' : 'our-galaxy'}
          onClose={() => hideNote('dark')}
        />
      )}
      {nsc && (
        <LayerCard
          title={NSC_LAYER_CARD.title}
          line={NSC_LAYER_CARD.line}
          caveat={NSC_LAYER_CARD.caveat}
          more={NSC_LAYER_CARD.more}
          sources={NSC_LAYER_CARD.sources}
          article={holeArticle}
          onClose={() => hideNote('nsc')}
        />
      )}
    </div>
  );
}
