/**
 * About Skyfold: what it is, who made it, how to cite it, and where its data and methods
 * come from.
 */
import { useState, type ReactNode } from 'react';
import { APP, AUTHOR } from '../../content/author';
import { Icon } from '../icons';
import { LogoMark } from '../Logo';
import { Chapter, Ext, Ref, type TocEntry } from './parts';
import { DESI_ACKNOWLEDGEMENT, SDSS_ACKNOWLEDGEMENTS } from '../../sim/surveys/credits';

export const ABOUT_TOC: TocEntry[] = [
  { id: 'overview', title: 'What it is' },
  { id: 'author', title: 'Author' },
  { id: 'cite', title: 'How to cite' },
  { id: 'sources', title: 'Sources and methods' },
  { id: 'limitations', title: 'Model limitations' },
  { id: 'software', title: 'Software and licences' },
  { id: 'privacy', title: 'Privacy' },
];

function Refs({ start, items }: { start: number; items: ReactNode[] }) {
  return (
    <ol className="doc-refs" start={start}>
      {items.map((c, i) => (
        <li key={i} value={start + i}>
          <span className="doc-refs-n">[{start + i}]</span>
          <span>{c}</span>
        </li>
      ))}
    </ol>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn btn-sm"
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true);
            window.setTimeout(() => setDone(false), 1600);
          },
          () => {},
        );
      }}
      aria-label={label}
    >
      <Icon name={done ? 'check' : 'copy'} size={11} />
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

const PRINCIPLES: [string, string][] = [
  ['True scale', 'Distances and sizes are never compressed, from a moon to the cosmic web. Drawing bodies larger is an explicit option, and says so.'],
  ['The real sky', 'Positions from published ephemerides, good to an arcminute from 1700 to 2200 and to about half a degree from 3000 BCE to 3000 CE, among 329,770 stars placed in three dimensions at their measured distances, and the galaxies beyond at theirs.'],
  ['Exact relativity', 'Aberration, Doppler shift, beaming and time dilation follow from the Lorentz transformation, not from low-speed approximations. Near a black hole, the bending of light and the slowing of clocks follow exactly from general relativity, for a black hole that does not spin.'],
  ['Expanding space', 'Beyond the Local Group space expands, and the program models it: the clock keeps cosmic time, and flights out there cross the expanding universe of the Planck 2018 model rather than zooming.'],
  ['Models labelled', 'Where the measurements run out, a model built from published measurements takes over (the Milky Way seen from outside, the shapes of other galaxies, the stars and the gas round the black hole at its centre), and its card says so.'],
  ['Fiction labelled', 'The one non-physical feature, faster-than-light travel, is marked in red wherever it appears.'],
];

function Overview() {
  return (
    <Chapter id="overview" title="What it is">
      <p className="doc-lead">
        Skyfold is a space exploration tool with real physics. It shows the universe as it is right now, from the Solar
        System at true scale to 329,770 stars in three dimensions, eleven real black holes, the Milky Way and the galaxies of
        the cosmic web, and lets you fly through it at nearly the speed of light, or hover over a black hole and fall in,
        with the sky and the clocks doing exactly what relativity says they do.
      </p>
      <p>
        It is for anyone who has wondered what the sky would look like from a starship, and how long the trip would really
        take. The numbers are always a click away, and Learn tells the science behind it. It runs in a web browser and needs
        no installation or account.
      </p>
      <div className="doc-principles">
        {PRINCIPLES.map(([t, d], i) => (
          <div key={t}>
            <span className="mono text-[10px] text-accent">0{i + 1}</span>
            <b>{t}</b>
            <span>{d}</span>
          </div>
        ))}
      </div>
      <TheMark />
    </Chapter>
  );
}

/** The mark, and what it depicts. */
function TheMark() {
  return (
    <div className="doc-markbox">
      <svg viewBox="4 4 56 56" width="96" height="96" aria-hidden className="shrink-0">
        <g fill="none" stroke="var(--color-fg)" strokeWidth="8">
          <circle cx="32" cy="32" r="24" />
          <circle cx="44" cy="32" r="12" />
        </g>
        <circle cx="52" cy="32" r="8" fill="var(--color-accent)" />
      </svg>
      <div>
        <h3 className="doc-h3-plain !mt-0">The mark</h3>
        <p>
          One circle on the sky, drawn twice: as it looks at rest, and as it looks from a ship moving at 0.6<i>c</i> towards the
          amber point, the apex. In stereographic projection, aberration shrinks everything towards the apex by the Doppler
          factor √((1 + <i>β</i>)/(1 − <i>β</i>)), which is exactly 2 at 0.6<i>c</i>. So the circle halves, and still passes
          through the apex. It is the same law the program uses to draw the sky in flight.
        </p>
      </div>
    </div>
  );
}

function Author() {
  return (
    <Chapter id="author" title="Author">
      <div className="doc-author">
        <div className="doc-monogram" aria-hidden>
          TL
        </div>
        <div className="min-w-0">
          <div className="doc-author-name">{AUTHOR.name}</div>
          <div className="doc-author-meta">
            <span className="mono">@{AUTHOR.handle}</span>
            <span aria-hidden>·</span>
            <span>{AUTHOR.affiliation}</span>
          </div>
          <div className="doc-author-links">
            <a className="btn" href={AUTHOR.github} target="_blank" rel="noreferrer">
              <Icon name="external" size={11} />
              GitHub
              <span className="mono text-fg-3">github.com/{AUTHOR.handle}</span>
            </a>
            <a className="btn" href={AUTHOR.linkedin} target="_blank" rel="noreferrer">
              <Icon name="external" size={11} />
              LinkedIn
              <span className="mono text-fg-3">linkedin.com/in/tommysliu</span>
            </a>
            <a className="btn" href={`mailto:${AUTHOR.email}?subject=Skyfold`}>
              <Icon name="mail" size={11} />
              Email
              <span className="mono text-fg-3">{AUTHOR.email}</span>
            </a>
          </div>
        </div>
      </div>
      {AUTHOR.bio.map((p) => (
        <p key={p.slice(0, 16)}>{p}</p>
      ))}
      <p>
        Skyfold was designed and built by {AUTHOR.name}. Corrections, bug reports and ideas for new journeys or places to visit are
        welcome by email, or as an issue on the project’s <Ext href={`${AUTHOR.repo}/issues`}>GitHub page</Ext>.
      </p>
    </Chapter>
  );
}

function Cite() {
  const url = `${window.location.origin}/`;
  const apa = `${AUTHOR.citeShort} (${APP.year}). ${APP.citeTitle} (Version ${APP.version}) [Computer software]. ${url}`;
  const bib = `@software{liu_skyfold_${APP.year},
  author  = {${AUTHOR.citeName}},
  title   = {${APP.citeTitleCaps}},
  year    = {${APP.year}},
  version = {${APP.version}},
  url     = {${url}}
}`;
  return (
    <Chapter id="cite" title="How to cite">
      <p>If you use Skyfold in teaching or in written work, please cite it as:</p>
      <div className="doc-cite">
        <p>
          {AUTHOR.citeShort} ({APP.year}). <i>{APP.citeTitle}</i> (Version {APP.version}) [Computer software]. {url}
        </p>
        <CopyButton text={apa} label="Copy citation" />
      </div>
      <div className="doc-code">
        <div className="doc-code-bar">
          <span className="cap">BibTeX</span>
          <CopyButton text={bib} label="Copy BibTeX" />
        </div>
        <pre>{bib}</pre>
      </div>
    </Chapter>
  );
}

function Sources() {
  return (
    <Chapter id="sources" title="Sources and methods">
      <h3 className="doc-h3-plain">Ephemerides and constants</h3>
      <Refs
        start={1}
        items={[
          <>
            D. Cross, <Ext href="https://github.com/cosinekitty/astronomy">Astronomy Engine</Ext> (MIT licence): planetary, lunar
            and Pluto positions; IAU rotation models.
          </>,
          <>
            JPL <Ext href="https://ssd.jpl.nasa.gov/horizons/">Horizons</Ext> (DE441): Voyager 1 barycentric state vectors,
            propagated as a two-body orbit about the Solar System barycentre until the moon and track data have loaded.
          </>,
          <>
            Orbit models of 25 moons and of Pluto about its barycentre, fitted to JPL Horizons satellite ephemerides (MAR099,
            JUP365, SAT441, URA182/URA184, NEP097/NEP105, PLU060) and the{' '}
            <Ext href="https://ssd.jpl.nasa.gov/sats/elem/">JPL satellite mean elements</Ext>: within 0.6 to 1,500 km over
            1981–2199, the mean orbit outside. NASA/JPL-Caltech.
          </>,
          <>
            Chebyshev fits to JPL Horizons of the dwarf planets, trans-Neptunian objects, comets, interstellar objects and
            spacecraft (ephemerides from NASA/JPL, NASA/JHUAPL/SwRI and NASA/GSFC; Giorgini et al. 1996, BAAS 28, 1158):
            within 250 km for small bodies and 25 km for spacecraft, two-body orbits outside the data. NASA/JPL-Caltech.
          </>,
          <>BIPM, The International System of Units, 9th ed. (2019); IAU 2012 B2, 2015 B2 and B3 resolutions.</>,
          <>
            NASA NSSDCA <Ext href="https://nssdc.gsfc.nasa.gov/planetary/factsheet/">Planetary Fact Sheets</Ext>: radii, GM,
            rotation and orbital data.
          </>,
        ]}
      />
      <h3 className="doc-h3-plain">Moons and small bodies</h3>
      <Refs
        start={7}
        items={[
          <>
            B. A. Archinal et al. (2018), Celest. Mech. Dyn. Astr. 130, 22: the IAU WGCCRE 2015 rotation models, as encoded in
            NAIF’s <Ext href="https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc">pck00011.tpc</Ext>; checked
            against the SPICE Toolkit to 3 × 10⁻¹⁰ rad.
          </>,
          <>
            JPL Solar System Dynamics: <Ext href="https://ssd.jpl.nasa.gov/sats/phys_par/">satellite physical parameters</Ext>,
            satellite mean elements and the <Ext href="https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html">Small-Body Database</Ext>:
            sizes, masses, albedos and orbits.
          </>,
          <>
            NASA PDS Small Bodies Node colour compilations (Neese 2014, 2020) and the PDS Rings Node ring tables: colours and
            rings.
          </>,
          <>
            The papers cited in the app’s body data, among them Ortiz et al. (2017, Haumea), Weaver et al. (2016, Nix and
            Hydra), Porter et al. (2024, Arrokoth), Pätzold et al. (2016, 67P) and Morgado et al. (2023, Quaoar); each fact on a
            body’s card links to its source.
          </>,
        ]}
      />
      <h3 className="doc-h3-plain">Catalogues</h3>
      <Refs
        start={11}
        items={[
          <>
            D. Nash, <Ext href="https://codeberg.org/astronexus/athyg">AT-HYG v4.0</Ext> (
            <Ext href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</Ext>), with distances and radial velocities
            from <Ext href="https://www.cosmos.esa.int/gaia">Gaia DR3</Ext> (ESA/Gaia/DPAC,{' '}
            <Ext href="https://www.cosmos.esa.int/web/gaia-users/license">CC BY-NC 3.0 IGO</Ext>; Gaia Collaboration 2023, A&amp;A
            674, A1; parallax zero-point of Lindegren et al. 2021), Hipparcos photometry and parallaxes (ESA 1997; van Leeuwen
            2007) via VizieR, variable-star names from <Ext href="https://codeberg.org/astronexus/hyg">HYG v4.4</Ext> and the{' '}
            <Ext href="https://www.iau.org/public/themes/naming_stars/">IAU star names</Ext>: 329,770 stars, every one to V ≈ 10
            and every catalogued one within 100 light-years. The derived star files may be used only non-commercially, with
            both credits.
          </>,
          <>
            O. Frohn, <Ext href="https://github.com/ofrohn/d3-celestial">d3-celestial</Ext> (BSD 3-Clause), after the IAU and Sky
            &amp; Telescope charts: the 88 constellation figures and names.
          </>,
          <>
            Star systems and named stars: orbits of Akeson et al. (2021, AJ 162, 14; Alpha Centauri A and B), Kervella et al.
            (2017, A&amp;A 598, L7; Proxima), Bond et al. (2017, ApJ 840, 70; Sirius) and (2015, ApJ 813, 106; Procyon), Shakht et
            al. (2017; 61 Cygni, preliminary) and Torres et al. (2015, ApJ 807, 26; Capella); of the 37 named stars and members
            of those systems, the sizes of 36 and the temperatures of 32 from the papers cited on their cards (the cards label
            the rest as estimates or colour temperatures). Sizes of other stars from their luminosity with the bolometric
            corrections of Flower (1996, ApJ 469, 355) as corrected by Torres (2010, AJ 140, 1158).
          </>,
          <>
            JPL <Ext href="https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html">Small-Body Database</Ext>: 1,465,911 asteroids and
            comets, their orbits solved from Kepler’s equation on the GPU, checked against JPL Horizons.
          </>,
          <>
            Proxima Centauri until the star catalogue has loaded: Gaia DR3 parallax; Boyajian et al. (2012), ApJ 757, 112:
            radius; Ségransan et al. (2003), A&amp;A 397, L5: temperature.
          </>,
          <>
            <Ext href="https://exoplanetarchive.ipac.caltech.edu/">NASA Exoplanet Archive</Ext>, Planetary Systems Composite
            Parameters (<Ext href="https://doi.org/10.26133/NEA13">doi:10.26133/NEA13</Ext>; Christiansen et al. 2025, PSJ 6, 186),
            retrieved 25 September 2026: 6,372 confirmed planets and their 4,779 stars. “This research has made use of the NASA
            Exoplanet Archive, which is operated by the California Institute of Technology, under contract with the National
            Aeronautics and Space Administration under the Exoplanet Exploration Program.” The stars’ J2000 positions are carried
            from Gaia DR3 (ESA/Gaia/DPAC, CC BY-NC 3.0 IGO) or the Hipparcos new reduction (van Leeuwen 2007, via VizieR), so this
            file too may be used only non-commercially, with the Gaia credit.
          </>,
          <>
            Eleven planetary systems from their papers, every value cited on the planet’s card: Agol et al. (2021, PSJ 2, 1;
            TRAPPIST-1), Suárez Mascareño et al. (2025, A&amp;A 700, A11; Proxima), Basant et al. (2025, ApJL 982, L1; Barnard’s
            Star), Cont et al. (2026, A&amp;A 710, A345; 51 Pegasi b), Wang et al. (2018, AJ 156, 192; HR 8799), Cabrera et al.
            (2014), Shallue &amp; Vanderburg (2018) and Shaw et al. (2025; Kepler-90), Pass et al. (2026, AJ 172, 175; TOI-700),
            Doyle et al. (2011, Science 333, 1602; Kepler-16), Thompson et al. (2025, AJ 170, 301; ε Eridani b), Feng et al.
            (2017, AJ 154, 135; τ Ceti), Beichman et al. and Sanghi et al. (2025, ApJL 989, L22 and L23; the candidate around α
            Centauri A). Sizes estimated from masses with the mass–radius relation of Chen &amp; Kipping (2017, ApJ 834, 17);
            the illustrative colours of giant planets follow the cloud classes of Sudarsky, Burrows &amp; Pinto (2000, ApJ 538,
            885).
          </>,
        ]}
      />
      <h3 className="doc-h3-plain">Imagery and shapes</h3>
      <Refs
        start={18}
        items={[
          <>
            <Ext href="https://www.solarsystemscope.com/textures/">Solar System Scope</Ext> (INOVE) surface and ring textures,{' '}
            <Ext href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Ext>.
          </>,
          <>NASA/JHUAPL/SwRI, New Horizons global colour mosaic of Pluto; unobserved southern latitudes filled procedurally.</>,
          <>
            <Ext href="https://astrogeology.usgs.gov/">USGS Astrogeology</Ext> global mosaics of 15 moons, Ceres and Vesta
            (Voyager, Galileo, Cassini, New Horizons, Dawn and Viking data: NASA/JPL-Caltech, SSI, DLR, JHUAPL/SwRI,
            UCLA/MPS/IDA, LPI; Mimas by T. Roatsch; Triton by P. Schenk; Phobos and Deimos by P. Stooke): public domain or no
            use constraints. Unimaged regions are a flat fill.
          </>,
          <>
            <Ext href="https://github.com/nasa/NASA-3D-Resources">NASA 3D Resources</Ext>: Voyager 2 maps of the five large
            Uranian moons, free and without copyright.
          </>,
          <>
            Shape models from the NASA PDS Small Bodies Node by R. Gaskell (Phobos), P. Thomas (Deimos, Hyperion), P. Stooke
            (Proteus, Halley) and S. Porter et al. (Arrokoth), and the DLR Dawn terrain model of Vesta: public.
          </>,
          <>
            Comet 67P: SHAP5 shape model by R. Gaskell, L. Jorda et al. (ESA/Rosetta/MPS for OSIRIS Team), licensed{' '}
            <Ext href="https://creativecommons.org/licenses/by-sa/3.0/igo/">CC BY-SA 3.0 IGO</Ext>; the simplified copy is under
            the same licence.
          </>,
        ]}
      />
      <h3 className="doc-h3-plain">The Milky Way</h3>
      <Refs
        start={24}
        items={[
          <>
            NASA/Goddard Space Flight Center <Ext href="https://svs.gsfc.nasa.gov/4851">Scientific Visualization Studio</Ext>,
            Deep Star Maps 2020, Milky Way background layer (Gaia DR2: ESA/Gaia/DPAC), re-encoded: public domain. Added to it,
            a map of the light of the catalogue’s stars too faint to draw one by one (V 6.5 to about 10), built from the star
            files [11] and under their terms: non-commercial use only, crediting David Nash (AT-HYG, CC BY-SA 4.0) and
            ESA/Gaia/DPAC (CC BY-NC 3.0 IGO).
          </>,
          <>
            A model of the Milky Way’s stars and dust, generated for Skyfold from published parameters: GRAVITY Collaboration
            (2022), Bennett &amp; Bovy (2019), Bland-Hawthorn &amp; Gerhard (2016), Reid et al. (2019), Wegg &amp; Gerhard (2013),
            Wegg, Gerhard &amp; Portail (2015), Drimmel &amp; Spergel (2001) and Chen et al. (2019).
          </>,
          <>
            Star clusters: open clusters from Hunt &amp; Reffert (2023, 2024, A&amp;A; Gaia DR3), globular clusters from Vasiliev
            &amp; Baumgardt (2021, MNRAS 505, 5978) and Baumgardt &amp; Vasiliev (2021, MNRAS 505, 5957), all{' '}
            <Ext href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Ext>, and the{' '}
            <Ext href="https://physics.mcmaster.ca/~harris/mwgc.dat">Harris catalogue</Ext> (1996, AJ 112, 1487; 2010 edition),
            supplied free of charge.
          </>,
          <>
            45 images of nebulae from ESA/Hubble, ESA/Webb, ESO and NSF NOIRLab,{' '}
            <Ext href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Ext>, modified for Skyfold (resized, black
            level subtracted, edges faded; three cropped). Each picture’s credit line is on its card and in the corner of the
            view while it shows, and all of them are listed in{' '}
            <Ext href={`${AUTHOR.repo}/blob/main/CREDITS.md#nebula-images`}>CREDITS.md</Ext>. Positions from SIMBAD (CDS,
            Strasbourg); distances from Hunt &amp; Reffert (2024), Bailer-Jones et al. (2021) and the papers named on each card.
          </>,
          <>
            The Galactic Centre: the mass and distance of Sagittarius A* and the orbits of S2, S29, S38 and S55 from GRAVITY
            Collaboration (2022, A&amp;A 657, L12;{' '}
            <Ext href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Ext>), its position from Reid &amp; Brunthaler
            (2004, ApJ 616, 872), and the K-band dust towards it from Fritz et al. (2011, ApJ 737, 73).
          </>,
        ]}
      />
      <h3 className="doc-h3-plain">Black holes</h3>
      <Refs
        start={29}
        items={[
          <>
            The physics of a black hole that does not spin: J. L. Synge (1966), MNRAS 131, 463 (the shadow); C. Darwin (1959),
            Proc. R. Soc. A 249, 180 (the paths of light); B. C. Carlson (1995), Numer. Algorithms 10, 13, and the{' '}
            <Ext href="https://dlmf.nist.gov/19">NIST DLMF</Ext>, chapter 19 (the elliptic integrals); V. Perlick (2004), Living
            Rev. Relativ. 7, 9, and Phys. Rev. D 69, 064017 (the exact lens equation); A. Gould (1994), ApJ 421, L71 (a star’s
            own disc at a caustic); A. J. S. Hamilton &amp; J. P. Lisle (2008), Am. J. Phys. 76, 519 (the raindrop and the
            free-fallers’ clocks); S. E. Gralla, D. E. Holz &amp; R. M. Wald (2019), Phys. Rev. D 100, 024018 (photon rings);
            J. M. Bardeen (1973), in <i>Black Holes</i> (Les Houches), 215 (the shadow of a spinning black hole, for the spin
            note); C. W. Misner, K. S. Thorne &amp; J. A. Wheeler, <i>Gravitation</i> (1973); S. Chandrasekhar, <i>The
            Mathematical Theory of Black Holes</i> (1983). Checked against an independent reference in 30 to 50 digit
            arithmetic, written for Skyfold with mpmath (F. Johansson and others) and kept with its scripts.
          </>,
          <>
            Sagittarius A* and M87*: GRAVITY Collaboration (2022, A&amp;A 657, L12: mass and distance; 2023, A&amp;A 677, L10:
            the flares’ orbit, which orients the gas); Event Horizon Telescope Collaboration (2019, ApJL 875, L1, L5 and L6;
            2022, ApJL 930, L12 to L17; 2025, arXiv:2509.24593); Do et al. (2019, Science 365, 664); Liepold, Ma &amp; Walsh
            (2023, ApJL 945, L35) and Simon, Cappellari &amp; Hartke (2024, MNRAS 527, 2341): M87*’s mass from its stars;
            Walker et al. (2018, ApJ 855, 128): M87’s jet.
          </>,
          <>
            The stellar-mass black holes and their stars: El-Badry et al. (2023, MNRAS 518, 1057, and 521, 4323) and
            Nagarajan et al. (2024, PASP 136, 014202): Gaia BH1 and BH2; Gaia Collaboration, Panuzzo et al. (2024, A&amp;A 686,
            L2): Gaia BH3; Miller-Jones et al. (2021, Science 371, 1046), Brocksopp et al. (1999, A&amp;A 343, 861), Gies et al.
            (2003, ApJ 583, 424) and Ramachandran et al. (2025, A&amp;A 698, A37): Cygnus X-1; Miller-Jones et al. (2009, ApJL
            706, L230), Casares et al. (2019, MNRAS 488, 1356) and Khargharia, Froning &amp; Robinson (2010, ApJ 716, 1105):
            V404 Cygni; González Hernández et al. (2014, MNRAS 438, L21), Cantrell et al. (2010, ApJ 710, 1127) and Gelino et
            al. (2006, ApJ 642, 438): A0620-00 and XTE J1118+480; Torres et al. (2019, ApJL 882, L21; 2020, ApJL 893, L37),
            Atri et al. (2020, MNRAS 493, L81) and Mikołajewska et al. (2022, ApJ 930, 9): MAXI J1820+070; Sahu et al. (2022,
            ApJ 933, 83; 2025, arXiv:2503.07820) and Lam et al. (2022, ApJL 933, L23): OGLE-2011-BLG-0462; Eggleton (1983, ApJ
            268, 368): a Roche lobe’s size. Each value is cited on the card that uses it. The positions and motions of Gaia
            BH1, BH2, A0620-00, MAXI J1820+070 and XTE J1118+480 are Gaia DR3’s (ESA/Gaia/DPAC,{' '}
            <Ext href="https://www.cosmos.esa.int/web/gaia-users/license">CC BY-NC 3.0 IGO</Ext>), via SIMBAD.
          </>,
          <>
            The gas falling into Sagittarius A*, a model: the hot, thin flow of Broderick &amp; Loeb (2006, MNRAS 367, 905) and
            Broderick et al. (2009, ApJ 697, 45), with the radial structure of Yuan, Quataert &amp; Narayan (2003, ApJ 598,
            301) and the synchrotron light of Leung, Gammie &amp; Noble (2011, ApJ 737, 21) and Pandya et al. (2016, ApJ 822,
            34), fitted for Skyfold to the fluxes of the Event Horizon Telescope (2022, ApJL 930, L13), Bower et al. (2019,
            ApJL 881, L2) and GRAVITY Collaboration (2020, A&amp;A 638, A2) and the near-infrared slope of Paugnat et al. (2024,
            ApJ 977, 228); the V band’s zero point from Bessell, Castelli &amp; Plez (1998, A&amp;A 333, 231).
          </>,
          <>
            The stars round Sagittarius A*, a model: Schödel et al. (2014, A&amp;A 566, A47; 2018, A&amp;A 609, A27; 2020,
            A&amp;A 641, A102), Gallego-Cano et al. (2018, A&amp;A 609, A26), Feldmeier-Krause et al. (2017, MNRAS 464, 194),
            Nogueras-Lara et al. (2020, Nature Astronomy 4, 377), Launhardt, Zylka &amp; Mezger (2002, A&amp;A 384, 112), Sormani
            et al. (2022, MNRAS 512, 1857), Paumard et al. (2006, ApJ 643, 1011), Lu et al. (2013, ApJ 764, 155) and Yelda et
            al. (2014, ApJ 783, 131); the stars’ brightness and colours from the{' '}
            <Ext href="https://mist.science">MIST</Ext> v1.2 isochrones (Choi et al. 2016, ApJ 823, 102; Dotter 2016, ApJS 222,
            8) with Kroupa’s (2001, MNRAS 322, 231) mass function. M87’s own starlight from the light profiles of Ferrarese et al.
            (2006, ApJS 164, 334) and Kormendy et al. (2009, ApJS 182, 216).
          </>,
        ]}
      />
      <h3 className="doc-h3-plain">Beyond the Milky Way</h3>
      <Refs
        start={34}
        items={[
          <>
            Galaxies: <Ext href="https://doi.org/10.3847/1538-4357/ac94d8">Cosmicflows-4</Ext> (Tully et al. 2023, ApJ 944, 94;
            CC BY 4.0) via CDS/VizieR, with the 2MASS Extended Source Catalog (“This publication makes use of data products from
            the Two Micron All Sky Survey, which is a joint project of the University of Massachusetts and the Infrared
            Processing and Analysis Center/California Institute of Technology, funded by the National Aeronautics and Space
            Administration and the National Science Foundation.”), and the{' '}
            <Ext href="https://github.com/apace7/local_volume_database">Local Volume Database</Ext> (Pace 2025, The Open Journal
            of Astrophysics 8, 142; CC0).
          </>,
          <>
            Galaxy surveys: <Ext href="https://data.desi.lbl.gov/doc/releases/dr1/">DESI Data Release 1</Ext> (DESI Collaboration
            et al. 2026, “Data Release 1 of the Dark Energy Spectroscopic Instrument”, AJ 171, 285; CC BY 4.0), its
            large-scale-structure catalogues (Ross et al. 2025, JCAP 01, 125), and{' '}
            <Ext href="https://www.sdss.org/dr17/">SDSS DR17</Ext> (Abdurro’uf et al. 2022, ApJS 259, 35; public domain): the
            SDSS-I/II galaxies, BOSS DR12 (Reid et al. 2016), the eBOSS DR16 catalogues (Ross et al. 2020; Raichoor et al. 2021)
            and DR16Q (Lyke et al. 2020). Changed for Skyfold: merged without duplicates or the Cosmicflows-4 galaxies, placed
            by redshift in the Planck 2018 cosmology, classed by colour, rounded to 5″ and 0.125 Mpc and tiled (docs/data/surveys.md
            in the source). And <Ext href="https://doi.org/10.5281/zenodo.10403370">Quaia</Ext>, the Gaia–unWISE quasar catalogue
            (Storey-Fisher et al. 2024, ApJ 964, 69; CC BY 4.0), without the quasars the surveys have, placed the same way with
            each redshift’s error kept as a distance error; and the galaxies of{' '}
            <Ext href="https://www.cosmos.esa.int/web/gaia/dr3">Gaia DR3</Ext> with a redshift from their BP/RP spectra
            (Gaia Collaboration, Bailer-Jones et al. 2023, A&amp;A 674, A41; Delchambre et al. 2023, A&amp;A 674, A31; ESA/Gaia/DPAC,
            CC BY-NC 3.0 IGO), without those the surveys or Quaia have, placed the same way. Their acknowledgements:
            <span className="mt-1 block">DESI: “{DESI_ACKNOWLEDGEMENT}”</span>
            {SDSS_ACKNOWLEDGEMENTS.map((a) => (
              <span key={a.phase} className="mt-1 block">
                {a.phase}: “{a.text}”
              </span>
            ))}
          </>,
          <>
            Named galaxies, clusters and young galaxies: positions from SIMBAD, sizes from RC3 (de Vaucouleurs et al. 1991) via
            VizieR (“This research has made use of the SIMBAD database and the VizieR catalogue access tool, CDS, Strasbourg,
            France.”), two redshifts from NED (“This research has made use of the NASA/IPAC Extragalactic Database (NED), which
            is funded by the National Aeronautics and Space Administration and operated by the California Institute of
            Technology.”), and distances, redshifts, disc angles and sizes from the papers cited on each card (Li et al. 2021;
            Breuval et al. 2023; Pietrzyński et al. 2019; Graczyk et al. 2020; EHT Collaboration 2019; McQuinn et al. 2016; Mei
            et al. 2007; Scolnic et al. 2025; Clowe et al. 2006; Bunker et al. 2023; Tacchella et al. 2023; Carniani et al.
            2024, 2025; Naidu et al. 2026; Corbelli et al. 2010; van der Marel &amp; Kallivayalil 2014).
          </>,
          <>
            Cosmic microwave background: the{' '}
            <Ext href="https://lambda.gsfc.nasa.gov/product/wmap/dr5/ilc_map_get.html">WMAP 9-year ILC map</Ext> (Bennett et
            al. 2013, ApJS 208, 20), NASA / WMAP Science Team: public domain; drawn with the end colours of Moreland’s (2009)
            cool–warm map, contrast enhanced about 10,000 times.
          </>,
          <>
            The expanding universe: flat ΛCDM with the Planck 2018 parameters (Planck Collaboration 2020, A&amp;A 641, A6), its
            massive neutrino included, and the CMB temperature of Fixsen (2009, ApJ 707, 916), checked against an independent
            implementation and astropy; the Local Group’s zero-velocity surface and barycentre from Karachentsev et al. (2009,
            MNRAS 393, 1265). What happens at home while a traveller is away: the Solar System’s age from Connelly et al.
            (2012, Science 338, 651), the Sun’s future from Schröder &amp; Connon Smith (2008, MNRAS 386, 155), the Milky Way and
            Andromeda from van der Marel et al. (2012, ApJ 753, 9) and Sawala et al. (2025, Nature Astronomy 9, 1206; their
            figure 3 read point by point,{' '}
            <Ext href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Ext>), the Large Magellanic Cloud from Cautun et
            al. (2019, MNRAS 483, 2185), and the far future from Loeb (2002, Phys. Rev. D 65, 047301), Krauss &amp; Scherrer
            (2007, Gen. Rel. Grav. 39, 1545) and Adams &amp; Laughlin (1997, Rev. Mod. Phys. 69, 337).
          </>,
          <>
            The galaxies drawn as models: light profiles and values typical of each type from van der Kruit &amp; Freeman
            (2011), Simien &amp; de Vaucouleurs (1986), Kennicutt (1981), Hernquist (1990), Fukugita, Shimasaku &amp; Ichikawa
            (1995) and Xilouris et al. (1999); the dwarfs’ dark matter from their stars’ speeds after Wolf et al. (2010).
          </>,
        ]}
      />
      <h3 className="doc-h3-plain">Methods</h3>
      <Refs
        start={40}
        items={[
          <>
            Relativistic rendering: the rest-frame scene is rendered to a cube map and resampled per pixel by the aberration
            formula; point sources are transformed analytically. Colour: a blackbody at <i>D</i>·<i>T</i> for stars; surfaces use
            a reflectance basis under a 5,772 K spectrum shifted by <i>D</i>, with <i>I</i>′<sub>λ</sub> = <i>D</i>
            <sup className="sup">5</sup> <i>I</i>
            <sub>λ</sub>(<i>λD</i>).
          </>,
          <>
            Black holes: one exact Schwarzschild lens at a time, for the black hole whose lens is largest where the camera is.
            Each time the camera’s distance changes, the deflection of light against its angle from the hole is tabulated in
            double precision (512 points, from Carlson’s elliptic integrals) with an inverse table for images of orders 0 to 3;
            the graphics chip reads them per pixel for diffuse light (the Galaxy layer resampled at each ray’s source, the
            photon ring’s band with several rays a pixel) and per vertex for stars and points, and bodies near the hole are
            solved exactly on the processor. Magnification is capped at the caustics by each star’s own disc (Gould 1994).
            The accretion flow is ray traced along exact light paths from the camera into a map in the lens’s frame. Checked
            on the target laptop’s graphics chip against the independent reference: escape directions within 0.001 of a
            pixel, point images within 0.005 of a pixel, and pictures of 16 views agreeing on at least 99.99 % of the pixels
            away from an edge.
          </>,
          <>
            Diffuse light (the Milky Way, the model of the Galaxy, the nebulae): a patch of sky the size of a faint star’s image
            is drawn as bright as a star holding the same light would be, from the SVS calibration of 18.44 − 2.5 log₁₀ <i>p</i>{' '}
            magnitudes per square arcsecond; it fades out between 22 and 24. The Galaxy’s 200,000 particles are Gaussian splats
            of linear light, dimmed by the dust model integrated along each line of sight, summed at a quarter of the screen’s
            resolution and turned into what is drawn afterwards; in flight each is aberrated and Doppler shifted like a star.
            Near the camera, where each would be hundreds of parsecs wide, the light of the discs and the young arm stars is
            instead integrated from the model’s laws along each line of sight through its dust, and handed over to the
            particles between 1 and 4 kpc out.
            The other galaxies are drawn the same way, each from a template of a few thousand points scaled, tilted and
            brightened to its measurements, dimmed by a layer of its own dust.
          </>,
          <>
            Flights beyond the Local Group: the equations of motion of a rocket in a flat Friedmann–Lemaître–Robertson–Walker
            universe, integrated with the Dormand–Prince 5(4) method (J. R. Dormand, P. J. Prince 1980, J. Comput. Appl. Math. 6,
            19), for a perfect engine and a destination that moves with the expansion; inside the Local Group, static space.
          </>,
          <>C. Wyman, P.-P. Sloan, P. Shirley (2013), JCGT 2(2): analytic CIE 1931 colour-matching functions.</>,
          <>F. J. Ballesteros (2012), EPL 97, 34008: B−V to effective temperature.</>,
          <>H. Neckel, D. Labs (1994), Sol. Phys. 153, 91: solar limb darkening (approximated).</>,
          <>J. J. van Wijk, W. A. A. Nuij (2003), IEEE InfoVis: smooth and efficient zooming and panning (camera slews).</>,
          <>
            M. L. Finson, R. F. Probstein (1968), ApJ 154, 327: dust tails as syndynes; L. Biermann (1951), Z. Astrophys. 29,
            274: ion tails along the solar wind. Both in simplified form for the comet tails.
          </>,
          <>
            E. F. Taylor, J. A. Wheeler, Spacetime Physics, 2nd ed. (1992); W. Rindler, Relativity: Special, General, and
            Cosmological, 2nd ed. (2006).
          </>,
        ]}
      />
    </Chapter>
  );
}

function Limitations() {
  return (
    <Chapter id="limitations" title="Model limitations">
      <p>
        Skyfold simplifies in the following ways, and says so on screen where it matters.
      </p>
      <ol className="doc-list-num">
        <li>
          Near the one black hole whose lens matters most, light is bent exactly (Schwarzschild) and clocks slow; everywhere
          else, and for every other black hole at the same moment, gravity bends neither light nor flights (apart from the
          expansion of the universe and the precession that general relativity adds to the S-stars’ orbits), and no other
          gravitational time dilation is applied. The other black holes’ lenses are then far below a pixel. Only the black
          hole’s own gravity is included (the Sun’s and the Galaxy’s, parts in 10⁸ and 10⁶, are left out), and only where it
          passes 5 parts in 10¹⁰; near a hole the time warp paces a clock hovering there, and home’s clock is one far from
          every mass. The flight planner ignores gravity, so it refuses to leave from within 30 horizon radii of a black
          hole.
        </li>
        <li>
          Every black hole is drawn without spin, since none is measured well enough to draw (Sagittarius A*: estimates from
          under 0.1 to 0.9; M87*: not measured; Cygnus X-1: claimed above 0.998). Spin makes a shadow smaller by less than
          about 8 % (the Event Horizon Telescope’s figure): at the angle we see Sgr A* from, a spin of 0.9 to 0.94 would make
          it about 5 to 7 % smaller and shift it by about half its horizon’s radius; seen edge-on, a fast spin makes a
          shadow up to 12 % narrower and 1.2 horizon radii off-centre. Nothing is drawn inside the shadow: a black hole formed by collapse has no white hole, and
          light traced back into it ends on the collapsed matter, whose light has faded. Near a hole your motion is measured
          against observers hovering there (falling, against observers falling from rest far away), and the engine is
          assumed to hold the ship, wherever you hover. In a fall home’s clock is shown on the free-fallers’ clocks
          (Painlevé–Gullstrand time), a convention, and the fall ends where tides pull a ship apart, 0.03 s before the
          centre, where general relativity stops working.
        </li>
        <li>
          Round Sagittarius A*, the gas falling in is a model (a hot, thin flow of the Broderick and Loeb type, fitted to its
          radio-to-infrared spectrum and oriented like the flares GRAVITY saw), drawn outside the horizon only. Its visible
          light has never been seen and is carried over from the infrared: uncertain by about three times either way, eight
          times fainter in a pessimistic model; it is smooth and steady where the real flow flickers tenfold within hours.
          The stars within a few parsecs of the hole are a statistical model of the nuclear star cluster and disc following
          published fits, not real stars (S2, S29, S38 and S55 apart); the fainter ones, and any within 0.01 pc of you, are a
          smooth glow. M87’s own starlight is a smooth model of its measured light profile. The discs of Cygnus X-1, LMC X-1,
          LMC X-3, M33 X-7 and GRS 1915+105 are models of a typical state; the other X-ray binaries’ discs, the jets of
          Cygnus X-1, GRS 1915+105 and M87* and V404 Cygni’s third star are not drawn; the orientation of the X-ray binaries’
          orbits on the sky is assumed (Cygnus X-1’s is taken from the direction of its jet), and so is GRS 1915+105’s
          phase; GX 339−4’s and XTE J1650−500’s masses, known only as ranges, are drawn at stated values; the galaxies’
          black holes have none of their galaxy’s starlight round them, and their masses are scaled to the app’s distances.
        </li>
        <li>Constant-speed trips start and stop instantaneously. The 1 g drive is the physically realisable profile.</li>
        <li>
          Flights beyond the Local Group cross an expanding universe (flat ΛCDM, Planck 2018) and assume a perfect engine and a
          destination that moves with the expansion, with no motion of its own. Inside the Local Group, which gravity holds
          together, space is taken as static. The clock runs billions of years ahead and the universe expands with it, but the
          bodies do not age: more than ten million years from the present the Sun, the planets and the stars are drawn as they
          are today, and their cards say so (with what the Sun and the Earth will have become, from Schröder and Connon Smith
          2008).
        </li>
        <li>
          Stars move in straight lines (good for about a million years either side of 2000; they stand still beyond), with no
          interstellar dust (none near the black holes either: the Sun seen past Sagittarius A* would really be dimmed by
          about 30 magnitudes); most double stars are one point, and the sizes of stars without a measured radius are
          estimates.
          The catalogue is complete to V ≈ 10 as seen from the Sun, so far from the Sun its stars thin out: that is the
          catalogue, not the Galaxy.
        </li>
        <li>
          Planets of other stars follow fixed Kepler orbits, so the tugs of their neighbours (transit-timing variations,
          precession) are left out, and so is the wobble they give their star. Most orbits’ orientation on the sky is not
          measured and is assumed; nobody has seen their surfaces, so their colours are illustrative. Each planet’s card says
          what is measured and what is assumed.
        </li>
        <li>
          Doppler colours of surfaces are approximate; stars are exact blackbodies. The cosmic microwave background seen at speed
          is a perfect blackbody without its tiny ripples; its map (WMAP) is a separate layer, contrast enhanced about 10,000
          times and drawn only while the relativistic view is off (below 0.01<i>c</i>, in classical optics, or on the classical
          side of the split screen).
        </li>
        <li>
          The Milky Way’s glow is the real sky only near the Sun; beyond a few hundred parsecs it is a model built from
          published measurements (Reid et al. 2019 arms, Wegg et al. bar, Drimmel and Spergel dust), whose points are not real
          stars and whose spiral arms are extrapolated beyond the parallax data, over the far side of the Galaxy. Near the
          camera its discs and young arm stars are a smooth glow worked out from the model’s laws, its points further out. The
          model’s dust is smooth: with no Local Bubble it dims high latitudes near the Sun too much, with no central molecular
          zone it dims the very centre too little, and it has none of the gaps through which the star clouds of Sagittarius and
          Scutum shine. Seen from the Sun the model is within half a magnitude of the real sky towards the anticentre and the
          poles, and over a magnitude fainter towards those star clouds. The sky from the Sun holds the light of the
          catalogue’s stars too faint to draw (to V ≈ 10) and of the stars fainter than about V = 11; those in between, a small
          share of the light, are in neither. The glow is shown as the eye would see it, down to about 23
          magnitudes per square arcsecond. Nebulae are their photographs from Earth, drawn as flat cards facing the Sun
          (mirrored from behind), at a brightness set for display; the points of the globular clusters are illustrative. Where
          the S-stars are now is their orbit carried 27,000 years beyond what we see.
        </li>
        <li>
          Other galaxies are models: their shapes are modelled from their measured size, brightness and orientation, with the
          light profile, arms, clumps and dust typical of their type. Where a disc’s near side is not known it is assumed (the
          real galaxy could be its mirror image), and a galaxy known only by its outline on the sky is taken to be as deep as
          it is wide. The most distant galaxies stand where they are now but are drawn as they were 13.5 billion years ago,
          their light redshifted and dimmed as a black body’s would be (in truth hydrogen absorbed all their visible light:
          to the eye they are dark). Galaxies beyond the Local Group are held at their places in the expanding universe, their
          own motions not followed, while groups and clusters keep their size; the CMB map is the pattern seen from the Solar
          System today.
        </li>
        <li>
          The cosmic web is Cosmicflows-4 drawn as a map: a survey, not a census. Its footprint is uneven (most of its galaxies
          lie in the northern galactic sky, almost none behind the Milky Way’s disc), and each galaxy’s own distance is 15 to 25%
          uncertain, so within 30 Mpc each is placed at its group’s measured distance, beyond 60 Mpc at the distance its group’s
          redshift gives in the Planck 2018 cosmology, and in between at a blend of the two.
        </li>
        <li>
          The galaxy surveys are placed by redshift, as if all of it came from the expansion: each galaxy’s own motion shifts it
          along our line of sight, so clusters are drawn as spikes pointing at the Solar System. They cover about a third of the
          sky and thin out with distance, and the galaxies too small to draw from where you are are shown as glows holding their
          light. Quaia’s quasars, over the whole sky but the Milky Way’s plane, have redshifts from Gaia’s low-resolution spectra,
          uncertain by about 200 Mpc in distance, and so are Gaia’s galaxies, out to about 2 billion parsecs: each is drawn as a
          streak along our line of sight over its likely distances. Behind the Milky Way’s plane, where its dust and stars hide
          what lies beyond, no survey sees galaxies: that band stays empty.
        </li>
        <li>Planets are lit without the 1/r² dimming of sunlight, and the relativistic view uses automatic exposure.</li>
        <li>The superluminal drive is fiction, provided for comparison; nothing measured during it has physical meaning.</li>
        <li>
          Moons, dwarf planets, comets and spacecraft are as good as their data: outside 1981–2199 the moons follow their mean
          orbits and the small bodies two-body orbits, both labelled; spacecraft do not exist before launch. Rotations nobody
          can predict (Hyperion, Halley, Nix), surfaces never mapped, Quaoar’s ring plane and the Adams arcs’ positions are
          illustrative, faint rings are drawn more visible than they are, and comet tails come from a simple physical model.
          Each body’s card says which.
        </li>
      </ol>
    </Chapter>
  );
}

function Software() {
  return (
    <Chapter id="software" title="Software and licences">
      <p>
        Built with React, three.js, React Three Fiber, postprocessing, zustand, KaTeX, Tailwind CSS and Vite. The typefaces are IBM
        Plex Sans, JetBrains Mono and Source Serif 4, all under the SIL Open Font Licence.
      </p>
      <p>
        The code is released under the MIT Licence, © {APP.year} {AUTHOR.name}. The star catalogue, maps, shape models and other data
        keep their own licences (the star and exoplanet files, the map of the faint stars’ light built from them and the
        black holes’ file are for non-commercial use only, because of their Gaia DR3 values, and the star files are also CC BY-SA 4.0; the 67P shape
        model is CC BY-SA 3.0 IGO; the Solar System Scope textures, the nebula images, the star clusters (the Harris catalogue
        apart, which is free of charge), the S-stars’ orbits, the Cosmicflows-4 galaxies, the DESI galaxies and the figure read from Sawala et al.
        are CC BY 4.0; the SDSS galaxies are in the public domain; the Local Volume Database is CC0; the NASA SVS sky and the WMAP map are public domain), listed under <Ref page="about" to="sources">Sources and methods</Ref>.
      </p>
      <p>
        The source code is on GitHub at <Ext href={AUTHOR.repo}>{AUTHOR.repo.replace('https://', '')}</Ext>.
      </p>
      <p className="mono text-[12px] text-fg-3">
        Version {APP.version} · build {APP.build}
        {APP.date ? ` · ${APP.date}` : ''}
      </p>
    </Chapter>
  );
}

function Privacy() {
  return (
    <Chapter id="privacy" title="Privacy">
      <p>
        Skyfold runs entirely in your browser. There are no accounts, cookies, advertising or analytics, and nothing you do is
        sent anywhere. Your preferences are kept in this browser’s local storage; clearing this site’s data in your browser
        removes them. The site is served as static files; the web host may keep ordinary request logs, but Skyfold
        itself collects nothing.
      </p>
    </Chapter>
  );
}

export default function AboutDoc() {
  return (
    <>
      <header className="doc-mast">
        <div className="doc-mast-k">About</div>
        <h1 className="doc-mast-logo">
          <LogoMark size={52} className="text-fg" />
          Skyfold
        </h1>
        <p>{APP.tagline}</p>
        <div className="doc-mast-meta mono">
          <span>Version {APP.version}</span>
          <span>by {AUTHOR.name}</span>
          <span>MIT Licence</span>
        </div>
      </header>
      <Overview />
      <Author />
      <Cite />
      <Sources />
      <Limitations />
      <Software />
      <Privacy />
    </>
  );
}
