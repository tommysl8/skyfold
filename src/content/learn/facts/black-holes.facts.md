# Fact file: black-holes

One line per fact: claim | value | source | status. "computed" means recomputed here (29 Sep 2026) with Python and mpmath at 30 digits from the cited inputs, with GM_sun = 1.32712440018e20 m^3/s^2, G = 6.67430e-11, c = 299,792,458 m/s, hbar and k_B from CODATA 2018, au = 149,597,870,700 m, pc = 648,000/pi au, light-year = 9,460,730,472,580.8 km, R_sun = 695,700 km, year = 365.25 d. Geometry is Schwarzschild (no spin) unless a line says otherwise; r_g = GM/c^2, r_s = 2GM/c^2 = 2 r_g. Sgr A* is taken as GRAVITY 2022's 4.297 million solar masses at 8,277 pc, as the app does.

Built from the research pass of 28 Sep 2026 (every source opened: primary scans rendered page by page where they had no text layer, arXiv and publisher abstracts, Crossref metadata, live pages) and re-checked for this article on 29 Sep 2026. The numbers the article quotes from Skyfold's own scenes are the scenes' notes (src/content/scenes.ts), which src/content/blackHoleScenes.test.ts checks against the physics; the two views of the fall were confirmed against an independent ray tracer before being stated (docs/data/blackholes.md, section 11).

## Opening: the Royal Astronomical Society, 11 January 1935
- RAS meeting, Friday 11 January 1935, reported in The Observatory 58, No. 729 (February 1935), pp. 33-41 | 1935 | ADS scan 1935Obs....58...33., https://adsabs.harvard.edu/pdf/1935Obs....58...33. | verified (primary, page images)
- Chandrasekhar described a critical mass above which a star "cannot have a degenerate core"; Milne commented; the President then invited Eddington "to speak on his paper 'Relativistic Degeneracy'" | 1935 | Observatory 58, 37 | verified (primary). Milne spoke between the two, so the article now says "After a comment from Edward Milne" (it had said "Eddington spoke next")
- Eddington: a star above the limit "has to go on radiating and radiating and contracting and contracting until, I suppose, it gets down to a few km. radius, when gravity becomes strong enough to hold in the radiation, and the star can at last find peace"; "I think there should be a law of Nature to prevent a star from behaving in this absurd way!" | 1935 | Observatory 58, 38 (page image re-read 29 Sep 2026) | verified (primary). Article quotes only "and the star can at last find peace" and paraphrases the rest; "a few km. radius" is paraphrased as "its radius was a few kilometres" (it had said "a few kilometres across")
- Chandrasekhar born 19 October 1910 in Lahore (so 24 on 11 January 1935); Cambridge research student under R. H. Fowler from 1930; Ph.D. summer 1933; Prize Fellow of Trinity College 1933-37; "During my Fellowship years at Trinity, I formed lasting friendships with several, including Sir Arthur Eddington and Professor E.A. Milne" | - | Nobel autobiography, https://www.nobelprize.org/prizes/physics/1983/chandrasekhar/biographical/ | verified
- Chandrasekhar's Nobel Prize in Physics 1983 (half) | 1983 | https://www.nobelprize.org/prizes/physics/1983/chandrasekhar/facts/ | verified
- "Ten other black holes" in Skyfold: M87*, Gaia BH1, BH2, BH3, Cygnus X-1, V404 Cygni, A0620-00, MAXI J1820+070, XTE J1118+480, OGLE-2011-BLG-0462 | - | src/sim/blackholes/blackholes.json | verified (repository)

## Dark stars: Michell and Laplace
- Michell's paper: a letter to Henry Cavendish dated Thornhill, 26 May 1783; printed in Phil. Trans. 74, 35-57 (1784) | - | archive.org philtrans00894012 (OCR); https://doi.org/10.1098/rstl.1784.0008 (Crossref: pp. 35-57, 1784) | verified (primary)
- When it was read: the printed header says "Read November 27, 1783"; Montgomery et al. (2009) say Cavendish read it in three instalments on 11 and 18 December 1783 and 15 January 1784 | - | archive.org OCR; Montgomery et al. 2009, p. 92 | uncertain (sources differ); article says only that Cavendish laid it before the Royal Society and that it was printed in 1784
- Michell took light to be particles slowed by gravity (the paper's title: the means of discovering the distance, magnitude, &c. of the fixed stars in consequence of the diminution of the velocity of their light) | - | Michell 1784; Montgomery et al. 2009 | verified
- Art. 16: a sphere of the Sun's density with a radius exceeding the Sun's "in the proportion of 500 to 1" would turn back its own light "by its own proper gravity" | - | Michell 1784, p. 42 | verified (primary)
- Art. 29: "if any other luminous bodies should happen to revolve about them we might still perhaps from the motions of these revolving bodies infer the existence of the central ones with some degree of probability" | - | Michell 1784, p. 44 | verified (primary; the article quotes the middle 17 words, long s modernised)
- Laplace, Exposition du système du monde, t. 2, p. 305 (Paris, Imprimerie du Cercle-Social, 1796): a luminous star of the Earth's density and 250 times the Sun's diameter would let none of its rays reach us; the largest luminous bodies of the universe may for that reason be invisible | 1796 | archive.org expositiondusyst02lapl | verified (primary; paraphrased in the article)
- The passage is in the 1799 edition and gone from the 1808 edition | - | archive.org b28760165 (1799) and bub_gb_x3mPFc9fSCsC (1808), OCR compared in the research pass | verified (primary)
- Laplace's 1799 proof was written at von Zach's request | - | Montgomery et al. 2009, pp. 94-95 | verified (secondary)
- Escape speed from the Sun's surface 617.7 km/s; c divided by it 485.4 | - | computed | verified
- At fixed density escape speed is proportional to radius (M proportional to R^3, so sqrt(M/R) proportional to R) | - | computed | verified
- Newtonian escape at c gives R = 2GM/c^2, the Schwarzschild radius | - | computed | verified
- Montgomery et al., quoting D. W. Hughes: both men chose the "big star" option; the black holes found are all very small and very dense | - | Montgomery et al. 2009, p. 95 | verified (secondary; paraphrased)
- Michell's star (500 solar radii at solar density) has 500^3 = 1.25e8 solar masses; its r_s is 1.06 times its radius | - | computed | verified
- Mean density of M87* inside a sphere of radius r_s: 0.44 kg/m^3, against air's 1.2 | - | computed | verified (a curiosity: r_s is not the radius of a ball in ordinary space)

## Schwarzschild, 1915-16
- Einstein presented the general theory in November 1915; Schwarzschild's solution came "just a few weeks after" | - | Nobel Prize in Physics 2020, popular background, https://www.nobelprize.org/prizes/physics/2020/popular-information/ | verified
- Schwarzschild: director of the Astrophysical Observatory in Potsdam from the end of 1909 ("the most prestigious post available for an astronomer in Germany"); volunteered in August 1914; weather station in Belgium, shell trajectories in France, then Russia, where he wrote his two relativity papers; sent the first to Einstein, who replied "I had not expected that one could formulate the exact solution of the problem in such a simple way"; he believed the solution's singular radius physically meaningless; pemphigus contracted in Russia; invalided home in March 1916; died 11 May 1916 in Potsdam, aged 42 | - | MacTutor, https://mathshistory.st-andrews.ac.uk/Biographies/Schwarzschild/ (re-read 29 Sep 2026) | verified (secondary)
- The paper was communicated to the Prussian Academy on 13 January 1916 (Sitzungsberichte 1916, 189-196) | 1916 | translation arXiv:physics/9905030 header; GRG translation https://doi.org/10.1023/A:1022971926521 (Crossref: GRG 35, 951-959, 2003) | verified. The arXiv translation carries a foreword arguing against black holes, so the article cites the GRG translation
- Up to the 1960s these solutions were regarded as theoretical speculations | - | Nobel 2020 popular background | verified
- r_s: Sun 2,953 m; Earth 8.87 mm; Sgr A* 12.69 million km = 0.0848 au = 18.2 solar radii; M87* (6.5e9) 128.3 au, 3.25 times Pluto's 39.48 au | - | computed | verified

## Collapse, 1930-39
- Chandrasekhar, "The maximum mass of ideal white dwarfs", ApJ 74, 81-82 (1931): limit 0.91 solar masses for molecular weight 2.5; note dated Trinity College, 12 November 1930; modern value about 1.4 | - | ADS scan, https://doi.org/10.1086/143324 | verified (primary)
- The physics of electron degeneracy (no two electrons in one state; relativistic electrons push back less hard) | - | standard; Eddington's remarks in Observatory 58, 38 discuss the same formulas | verified
- Oppenheimer & Volkoff, Phys. Rev. 55, 374 (15 February 1939): no static solutions above 3/4 solar mass in their model; heavier matter "will ... contract indefinitely, although more and more slowly" | 1939 | APS abstract; Crossref | verified
- Oppenheimer & Snyder, Phys. Rev. 56, 455 (1 September 1939): collapse time for a comoving observer "of the order of a day"; the outside observer sees the star shrink towards its gravitational radius; light "is progressively reddened, and can escape over a progressively narrower range of angles" | 1939 | APS abstract; Crossref (issued 1939-09-01) | verified (the article quotes "over a progressively narrower range of angles")
- 1 September 1939 is the day Germany invaded Poland | - | general history | verified (common knowledge)
- Einstein, Annals of Mathematics 40, 922-936 (October 1939): argued no real body could be squeezed that small; wrote that the infinite time is "measured in 'coördinate time'" | 1939 | J. D. Norton, "Einstein against singularities: analysis versus geometry", Philosophy of Physics 2, 13 (2024), p. 14, https://doi.org/10.31389/pop.91 (CC BY 4.0; the same passage is on pp. 19-20 of the 2023 preprint first read, https://sites.pitt.edu/~jdnorton/papers/Einstein_singularities.pdf); Crossref https://doi.org/10.2307/1968902 (issued 1939-10) | verified (secondary quoting primary; published text re-read 29 Sep 2026: "His 1939 paper argued that no spacetime could form with a bare Schwarzschild radius" and "Einstein is not confusing an infinite coordinate time with an infinity of proper time")
- Nobel 2020: "Einstein did not himself believe that black holes really exist" | - | Nobel press release, 6 October 2020 | verified (paraphrased)
- The popular Einstein quotation "do not exist in physical reality" | - | popular sources only | uncertain; not used
- Frozen stars: far away, the falling camera's image "would slow and then seem to freeze just shy of it. This is why astronomers originally referred to black holes as 'frozen stars.'" | 2024 | NASA Science, 6 May 2024 | verified (used in the myth)

## The horizon, spin and the name
- Finkelstein, Phys. Rev. 110, 965 (15 May 1958): r = 2m "acts as a perfect unidirectional membrane: causal influences can cross it but only in one direction" | 1958 | APS abstract | verified (paraphrased)
- Kruskal, Phys. Rev. 119, 1743 (1 September 1960), maximal extension | 1960 | Crossref | verified
- Penrose, Phys. Rev. Lett. 14, 57 (18 January 1965); Nobel 2020 half "for the discovery that black hole formation is a robust prediction of the general theory of relativity"; Nobel background on realistic collapse "with its dints, dimples and natural imperfections" | - | Crossref; Nobel press release and popular background | verified
- Kerr: calculating the angular momentum at the University of Texas with Alfred Schild in the room ("Alfred puffing away at his pipe ... myself chain-smoking cigarettes"), then "Its rotating!"; Phys. Rev. Lett. 11, 237 (1 September 1963); First Texas Symposium, Dallas, 16-18 December 1963, called to explain quasars | - | R. P. Kerr, arXiv:0706.1109, pp. 19-21; Crossref | verified (memoir)
- Kerr is a New Zealander | - | Kerr 2007 memoir | verified
- Schmidt, Nature 197, 1040 (16 March 1963), 3C 273 | 1963 | Crossref | verified
- Quasars' energy: "There is only one way to obtain that much energy within the limited volume of a quasar – from matter falling into a massive black hole" | - | Nobel 2020 popular background | verified
- No-hair: the geometry outside an isolated, settled black hole is characterised by mass, electric charge and spin | - | Hamilton, https://jila.colorado.edu/~ajsh/insidebh/schw.html | verified (secondary, by a working relativist)
- "Black holes" first in print: A. Ewing, Science News-Letter 85, 39 (18 January 1964), reporting an AAAS meeting in Cleveland; who said it first is not known | 1964 | Crossref https://doi.org/10.2307/3947428; T. Siegfried, Science News, 23 December 2013 | verified
- Wheeler used it in his AAAS lecture of 29 December 1967 in New York | 1967 | Herdeiro & Lemos, arXiv:1811.06587 | verified (secondary)
- Myth (vacuum cleaners): "Black holes don't suck in other matter. From far enough away, their gravitational effects are just like those of other objects of the same mass"; replace the Sun with a black hole of the same mass and the planets stay in their orbits, the Solar System much colder | - | NASA Science, "Black Holes" | verified
- Sgr A*'s gravity dominates only within a few parsecs of the centre | - | Our galaxy (Bland-Hawthorn & Gerhard 2016, influence radius 3.8 pc) | verified (cross-article)

## Finding one
- X-rays from gas heated as it swirls into the black hole | - | Globe and Mail obituary of Tom Bolton (19 Feb 2021) | verified (secondary)
- Cygnus X-1 found in 1964 by Geiger counters on a sub-orbital rocket from New Mexico; Hawking bet Thorne in 1974 that it was not a black hole, conceded 1990; 7,200 light-years; the pair a quarter of an au apart | - | ICRAR, 19 February 2021; separation computed | verified; the separation corrected from "a fifth" (below)
- Uhuru: first satellite dedicated to X-ray astronomy; launched 12 December 1970 from the San Marco platform in Kenya | - | NASA HEASARC | verified
- Localised on the catalogued star HDE 226868; about ninth magnitude; a B0 supergiant (blue) | - | Globe and Mail; Murdin interview ("about +9 magnitude"); Bolton, Nature 235, 271, abstract on nature.com (opened 29 Sep 2026): "THE ninth magnitude B0Ib star HDE 226868 is closely coincident with the position of Cygnus X-1" | verified (primary abstract)
- Webster and Murdin used the Isaac Newton Telescope at Herstmonceux, East Sussex, in 1971; Bolton began measuring HDE 226868 in 1971 at the David Dunlap Observatory in Richmond Hill (near Toronto); 5.6-day orbit round a massive unseen object ("All evidence suggested that the companion was a black hole"); papers Nature 235, 37 (published 7 January 1972; radial velocities August to October 1971) and 271 (published 4 February 1972) | - | BBC Sky at Night (5 June 2024); Globe and Mail; nature.com abstract pages (opened 29 Sep 2026) | verified. "Too heavy to be a neutron star" was not found in the abstracts or the secondary sources opened (the letters' full text was not read), so the article now says "a heavy companion that gave off no light, most likely a black hole" and the timeline "a heavy companion that gives off no light"; "night after night" was dropped as unsourced
- Bolton's vanity licence plate read CYG X-1 | - | Globe and Mail | verified
- Murdin: the poor observing conditions let them study a +9 star others were turning their backs on; in California that would be "a bit of a waste" | - | BBC Sky at Night interview | verified (not used after cuts)
- Miller-Jones et al., Science 371, 1046 (2021): 2.22 kpc by radio parallax; black hole 21.2 +/- 2.2, companion 40.6 solar masses; spin a > 0.9985 | 2021 | Crossref; arXiv:2102.09091 | verified
- Ramachandran et al., A&A 698, A37 (2025): donor about 29 solar masses; black hole 12.7 to 17.8 depending on the inclination | 2025 | Crossref abstract, https://doi.org/10.1051/0004-6361/202554184 | verified ("13 to 18" in the article)
- Gaia BH1 (El-Badry et al., MNRAS 518, 1057, 2023; found 2022): Sun-like star, 480 pc, 185.6-day orbit, 9.62 +/- 0.18 solar masses; nearest known black hole | - | arXiv:2209.06833 abstract; Crossref | verified
- Gaia BH1 in Ophiuchus; 1,570 light-years | - | blackholes.json (SIMBAD position); computed 480 pc = 1,566 ly | verified
- Nagarajan et al., PASP 136, 014202 (2024): 115 radial velocities, 40 from ESPRESSO; "this implies a BH mass of M_BH = 9.27 +/- 0.10 M_sun" (with the Gaia inclination) | 2024 | Crossref abstract, https://doi.org/10.1088/1538-3873/ad1ba7; arXiv:2312.05313 abstract (29 Sep 2026) | verified. Article: "Precise radial velocities, many from the ESPRESSO spectrograph" (it had credited all of them to ESPRESSO; 75 of the 115 came from other instruments)
- ESPRESSO is at ESO's Very Large Telescope in Chile | - | general (ESO) | verified (common knowledge)
- Gaia BH2 (El-Badry et al., MNRAS 521, 4323, 2023): red giant, 1,277 days, 1.16 kpc, 8.9 solar masses | 2023 | Crossref; arXiv:2302.07880 | verified
- Gaia BH3 (Gaia Collaboration, Panuzzo et al., A&A 686, L2, 2024): 32.70 +/- 0.82 solar masses, 11.6-year orbit, 590 pc, very metal-poor giant, found in pre-release DR4 validation; ESA: in Aquila, 1,926 light-years, "the first time a black hole of stellar origin this big has been spotted within the Milky Way" | 2024 | Crossref; ESA 16 April 2024 | verified
- Gaia BH3's companion: [Fe/H] = -2.56 (1/363 of the Sun's iron, "about 1/360"); relative orbit a = 16.55 au, e = 0.7291: 4.48 to 28.6 au ("4.5 to 29") | - | blackholes.json and docs/data/blackholes.md (from Panuzzo et al. Tables 1-3); computed | verified
- Sahu et al., ApJ 933, 83 (2022): isolated black hole from astrometric microlensing; Hubble at 8 epochs over about 6 years; 7.1 +/- 1.3 solar masses at 1.58 kpc; long-duration bulge event | 2022 | arXiv:2201.13296 abstract; Crossref | verified
- Lam et al., ApJL 933, L23 (2022): "An isolated mass-gap black hole or neutron star", 1.6-4.4 solar masses | 2022 | Crossref | verified
- Sahu et al. 2025 (ApJ 983, 104, 11 April 2025; arXiv:2503.07820): three more HST epochs, 11-year baseline; 7.15 +/- 0.83 solar masses at 1.52 +/- 0.15 kpc, moving 51.1 +/- 7.5 km/s relative to the stars in its neighbourhood | 2025 | arXiv abstract (read 29 Sep 2026); the published abstract through Crossref, https://doi.org/10.3847/1538-4357/adbe6e (CC BY 4.0), gives the same numbers | verified
- OGLE-2011-BLG-0462 towards Sagittarius; position known to about 0.1 arcsec | - | blackholes.json (SIMBAD) | verified (repository)
- GW150914: 14 September 2015, 09:50:45 UTC, both LIGO detectors; 35 to 250 Hz; 36 + 29 -> 62 solar masses; 3.0 solar masses radiated; "the event took place 1.3 billion years ago" | 2015-16 | PRL 116, 061102 (APS abstract); LIGO release 11 February 2016 (re-read 29 Sep 2026; it rounds the time to 09:51 UTC) | verified. The article had said "about 1.3 billion light-years away", which neither source says (the PRL gives a luminosity distance of 410 Mpc); now "some 1.3 billion years ago"
- Nobel 2017 to Weiss, Barish and Thorne | 2017 | Nobel press release | verified
- O4 ran 24 May 2023 to 18 November 2025; "roughly 250 candidate signals in real time" | 2025 | LIGO Caltech news, 18 November 2025 (re-read 29 Sep 2026) | verified

## The numbers table
- Sgr A*: 4.297e6 solar masses, 8,277 pc = 27,000 light-years, r_s 12.7 million km | - | GRAVITY 2022; computed | verified
- M87*: 6.5e9 (EHT 2019 Paper VI: 6.5 +/- 0.2 +/- 0.7 e9 at 16.8 Mpc), 55 million light-years (ESO: 55 million), r_s 128 au | - | Crossref; eso1907; computed | verified
- M87* from stellar dynamics: 5.37e9 (Liepold, Ma & Walsh, ApJL 945, L35, 2023) and 8.7 +/- 1.2 +/- 1.3 e9 (Simon, Cappellari & Hartke, MNRAS 527, 2341, 2024) | - | Crossref abstracts (read 29 Sep 2026) | verified ("5.4 to 8.7 billion")
- Cygnus X-1 r_s 62.6 km; Gaia BH1 (9.27) 27.4 km; Gaia BH3 96.6 km; OGLE-2011-BLG-0462 (7.15) 21.1 km; distances 2.22 kpc = 7,240 ly, 480 pc = 1,566 ly, 590 pc = 1,924 ly, 1.52 kpc = 4,958 ly | - | computed | verified

## What a black hole looks like: history
- 1919 eclipse: Einstein's 1.75 arcsec at the limb (Newtonian 0.87); Sobral 4-inch lens 1.98 +/- 0.12; Principe 1.61 +/- 0.30 | 1920 | Dyson, Eddington & Davidson, Phil. Trans. A 220, 291 (1920), archive.org scan; Crossref | verified (primary)
- 4GM/(c^2 R_sun) = 1.751 arcsec | - | computed | verified
- Rudi W. Mandl, a Czech amateur scientist, visited Einstein in Princeton on 17 April 1936; Einstein's Science note (84, 506, 4 December 1936); to the editor of Science: "It is of little value, but it makes the poor guy happy" | 1936 | J. Renn & T. Sauer, MPIWG Preprint 160 (2000), pp. 2-13 (re-read 29 Sep 2026); Crossref | verified (secondary quoting primary)
- Luminet, A&A 75, 228 (1979), received 13 July 1978, Paris-Meudon; computed on an IBM 7040 with punched cards; drawn by hand with Indian ink on negative paper, "a few thousands dots"; first printed in November 1978 in a French popular magazine (Carter & Luminet 1978); an earlier film of a black hole against a star field by Palmer, Pryce and Unruh, also 1978 | - | ADS scan; Luminet, arXiv:1902.11196, pp. 4-6 | verified. The timeline now dates the picture 1978 (computed, drawn and first printed), and the book and video notes say "the first picture of a black hole with its disc of gas", not "the first picture"
- Falcke, Melia & Agol, ApJ 528, L13 (2000): the shadow "may be observable with very long-baseline interferometry at sub-millimeter wavelengths" | 2000 | arXiv abstract | verified
- Synge, MNRAS 131, 463 (1966): photons escape a gravitationally intense star only within a "slender critical cone" | 1966 | ADS scan | verified (primary)

## What a black hole looks like: the physics
- Hovering clock rate sqrt(1 - r_s/r): 10 r_s 0.94868 (home x1.0541); 1.01 r_s 0.09950 (x10.05); at r_s zero | - | computed | verified
- r is the areal radius (sphere area 4 pi r^2) | - | standard (Schwarzschild coordinates) | verified
- Blueshift of starlight for a hovering observer 1/sqrt(1 - r_s/r) | - | computed | verified
- Thrust to hover (GM/r^2)/sqrt(1 - r_s/r): 3,806 g at 10 r_s of Sgr A*; 1 g at 1,202 r_g = 51.0 au | - | computed | verified
- Critical impact parameter sqrt(27) GM/c^2 = 2.598 r_s; photon sphere 1.5 r_s | - | standard; computed | verified
- Nothing from inside the shadow: a black hole formed by collapse has no white hole | - | docs/data/blackholes.md, label 2 | verified (model statement of the app)
- Shadow radius sin(alpha) = (3 sqrt3 / 2)(r_s/r) sqrt(1 - r_s/r): 10 r_s 14.269 deg (28.54 across); 3 r_s 45.000; 1.5 r_s 90; straight-line horizon at 10 r_s 5.739 deg radius (11.48 across) | - | computed | verified
- Far away: angular diameter sqrt(27) r_s / D; Sgr A* 53.25 uas at 8,277 pc | - | computed | verified
- Weak-field bending 2 r_s / b = 4GM/(c^2 b); Einstein ring theta_E = sqrt(2 r_s / d) for a source far behind | - | standard; computed | verified
- From 4,000 au of Sgr A*: 0.00651 rad = 0.373 deg by the formula; exact 0.374039 deg; ring 0.75 deg across; full Moon 0.518 deg | - | computed | verified
- From 10^4 r_s of any black hole: 0.81 deg radius, 1.62 deg across (the app frames stellar black holes from 10^4 r_s) | - | computed; src/sim/blackholes/records.ts STELLAR_FRAMING_RS | verified
- Photon ring: at 3 r_s the band beyond the shadow edge is 0.637 deg (to 45.637), the next copy within 0.027 deg (45.027); ratio 23.5; the limit is e^pi = 23.1 | - | computed; recomputed with the app's own staticSweep in the tab (29 Sep 2026): successive copies 23.6 times thinner at 6 M, 24.2 at 20 M, 24.6 at 100 M and far away, tending to 23.1 further in | verified. Article: "each 23 to 25 times thinner than the last" (it had said "about 23")
- Photon subrings "exponentially narrower" | - | Johnson et al., Sci. Adv. 6, eaaz1310 (2020), abstract | verified
- Scale: without spin every black hole looks the same at the same r/r_s | - | geometry | verified
- Scene numbers as the article quotes them: sgr-a-star-shadow (20 M, 0.85 au): 28.5 deg across, ring 59.7 deg across; sgr-a-star-einstein-ring (100 M, 4.24 au): ring 24.6 deg across, mirrored sky to 3.035 deg, shadow edge 2.949 deg; photon-ring (6 M, 0.25 au): 45.00 deg, band 0.64 deg, next within 0.03 deg; dive-and-climb: 28.5, 6.6, 114 deg across; sgr-a-star-flyby (10 M, 0.42 au, 0.9c): 25.8 deg across centred 28.7 deg from ahead (hovering 55.4 deg at 90 deg); isco-orbit: 0.5c, 23.0 min on board, 32.6 min distant, shadow 81.8 deg across pulled 22.2 deg forward | - | src/content/scenes.ts notes; computed independently (28 Sep 2026) | verified
- go:sgr-a-star frames from 4,000 au (src/sim/galaxy/records.ts); shadow there 0.0063 deg across | - | repository; computed | verified
- go:m87-star frames from 50 r_s = 6,416 au = 100 M: shadow 5.9 deg across, ring 24.6 deg across (same as Sgr A* at 100 M); scale 6.5e9/4.297e6 = 1,513 | - | src/sim/blackholes/records.ts M87_FRAMING_RS; computed; in the app (29 Sep 2026): r = 100 M, shadow 5.897 deg, Einstein ring 24.586 deg; the screen is dark to 2.95 deg from the hole, then 178-198 of 255 with no feature at the ring's 12.3 deg | verified. The ring does not show in M87's smooth starlight, so the caption says so (it had said "inside a ring 24.6° across"), and "the same view" became "the same geometry"

## The gas
- Sgr A* accretion rate (5.2-9.5) x 10^-9 solar masses a year in the EHT's models | 2022 | EHT Sgr A* Paper V, ApJL 930, L16 | verified
- Sgr A* is a variable near-infrared source with flares | 2020 | GRAVITY Collaboration, A&A 638, A2 (2020), arXiv:2004.07185 abstract | verified
- GRAVITY 2018: hot spots near the last stable orbit moving at about 30% of the speed of light | 2018 | A&A 618, L10, abstract | verified
- The app's flow: a RIAF of the Broderick & Loeb (2006) type fitted to Sgr A*'s radio-to-infrared spectrum, oriented like the flares' orbit (a model choice); visible light extrapolated from the infrared, uncertain by about three times; smooth and steady, where the real flow flickers; the 1.3 mm view is the model's, not the EHT's reconstruction | - | docs/data/blackholes.md labels 12-13; src/sim/blackholes/sgraFlow.json | verified (model statements)
- Dust: about 30 magnitudes of visual extinction towards the Galactic Centre | 2010 | Genzel, Eisenhauer & Gillessen, RMP 82, 3121 (2010) | verified
- sgr-a-star-flow: 20 M on the line to the Sun; 8,277 pc / 0.848 au = 2.01e9 ("two billion times closer") | - | computed | verified

## The two giants
- S2: pericentre about 120 au at about 7,700 km/s | 2020 | GRAVITY 2020, A&A 636, L5 | verified
- Genzel and Ghez shared half the 2020 Nobel Prize | 2020 | Nobel press release | verified
- s2-behind-sgr-a-star (app): images 0.81 and 0.68 deg ("about 0.8 and 0.7"), x5.4, 30 minutes a second, S2's clock loses 60 s a day ("about a minute") | - | scene note; computed independently: 0.80 / -0.66 deg, x5.41, 59 s a day at 7,700 km/s | verified
- sky-from:sgr-a-star (app, at the fixed test date): the Sun 27,000 ly behind, ring 0.473 deg across from 10,000 au, magnitude -4.3 without dust | - | holeSky() in the app, 29 Sep 2026 | numbers verified (computed independently: 0.236 deg radius, V -4.28), but the see-it block was removed from the article: run in the tab, the whole view is white (the nuclear cluster's glow at an exposure of 1.0) and the ring cannot be seen, as docs/data/blackholes.md section 9 records
- M87*: EHT image announced 10 April 2019; 55 million light-years; 6.5 billion solar masses | 2019 | ESO eso1907 | verified
- Ring 42 +/- 3 uas | 2019 | EHT M87 Paper VI | verified
- 2018 ring consistent in size, brightness peak shifted about 30 deg | 2024 | EHT, A&A 681, A79 (OSTI abstract; CfA release) | verified
- 2017, 2018, 2021: persistent diameter 43.9 +/- 0.6 uas; azimuthal brightness varies year to year; EVPA helicity change in 2021 | 2025 | arXiv:2509.24593 abstract (read 29 Sep 2026); published as A&A 704, A91 (December 2025), https://doi.org/10.1051/0004-6361/202555855 (CC BY 4.0; the Crossref abstract gives the same 43.9 +/- 0.6 uas); MPIfR release 16 Sep 2025 ("unexpected polarization flips") | verified
- Sgr A* EHT image 12 May 2022 | 2022 | ESO eso2208; EHT Paper I | verified
- Myth: the horizon is "around 2.5 times smaller than the shadow"; ratio sqrt(27)/2 = 2.598 | - | ESO eso1907 note; computed | verified
- M87* shadow from Earth 39.7 uas, Sgr A* 53.3: M87* "looks a little smaller"; 16.8 Mpc / 8.277 kpc = 2,030 | - | computed | verified
- m87-star-close: 1,000 au = 15.59 r_g = 7.8 r_s; shadow 36.3 deg across; clock 0.9336; 4.2 g | - | scene note; computed | verified

## Falling in
- Tidal stretch across 2 m at r_s: 2GM L / r_s^3: Sgr A* 1.116e-3 m/s^2 (1.14e-4 g); 10 solar masses 2.06e8 m/s^2 (2.1e7 g); proportional to 1/M^2 | - | computed | verified
- Schnittman: "If you have the choice, you want to fall into a supermassive black hole"; the NASA films are of a 4.3-million-solar-mass black hole | 2024 | NASA Science, 6 May 2024 | verified (paraphrased)
- hover-at-the-horizon (2.02 M): sky disc 14.83 deg in radius; x10.05; 3.6 million g | - | scene note; computed | verified
- Fall from rest at infinity, tau = (2/3) r^1.5 / sqrt(2M): 20 M to 2 M 864.2 s; 2 M to 0 28.2 s; 2 M to 1 M 18.2 s; 1 M to 0 10.0 s; longest possible pi GM/c^3 = 66.5 s | - | computed | verified
- Dark patch ahead at the horizon: arccos(-23/31) complement, 42.10 deg radius (84.2 across); at 0.5 r_s 53.27 deg (107 across) | - | computed (two independent derivations); confirmed in the app: 42.1035 and 53.2703 deg on fixture cameras, and 42.132 and 53.323 deg against 42.146 and 53.357 expected in the app's own fall at r = 1.995 and 0.994 M | verified (docs/data/blackholes.md section 11, 29 Sep 2026: "the article may state 84° across at the horizon and 107° across halfway in"; the 42.146 and 53.357 there are the exact formula's values at those radii, and the ray-tracer comparison is of the 16 reference pictures, 99.99-100 % of pixels). Re-measured in the app (29 Sep 2026): 84.27 deg across at r = 1.996 M, 106.54 deg at r = 1.00004 M, 168.4 deg at the fall's end (r = 0.0207 M, tides 1,000 m/s^2, tau 892.358 s, 0.030 s before the centre)
- Near the singularity the view "looks like you are landing on a flat plane"; torn apart "approximately a tenth of a second" before the singularity whatever the mass; "It is a common misconception that if you fall inside the horizon of a black hole you will be engulfed in blackness"; the sky concentrates into a bright circle only when hovering | - | Hamilton, schw.html (re-read 29 Sep 2026) | verified (secondary)
- fall-into-sgr-a-star (app): first 813 s in 20 s, last 80 s in real time; ends where tides reach 1,000 m/s^2, 0.03 s before the centre; home's clock on the free-fallers' clocks, a convention | - | scene note; docs/data/blackholes.md label 10 | verified

## Hot black holes
- Hawking's area theorem, PRL 26, 1344 (24 May 1971) | 1971 | APS abstract | verified
- Bekenstein, PRD 7, 2333 (1973): entropy proportional to area; also Lett. Nuovo Cimento 4, 737 (1972) | - | APS abstract; Crossref | verified
- Hawking, Nature 248, 30 (1 March 1974) | 1974 | Crossref | verified
- T = hbar c^3 / (8 pi G M k_B): hbar c^3 = 2.841e-9; 8 pi GM_sun k_B = 0.04605; Sun 6.17e-8 K; Sgr A* 1.436e-14 K; CMB 2.7255 K is 1.9e14 times hotter; CMB-temperature mass 4.50e22 kg = 0.61 Moon masses; evaporation (photons only) 2e67 yr for one solar mass, "about 10^67" | - | computed | verified (evaporation time an order of magnitude)
- GW250114 (14 January 2025): 33.6 and 32.2 solar masses; only LIGO online; heard "with unprecedented clarity"; area about 240,000 km^2 before and about 400,000 km^2 after; 99.999% against 95% in the 2021 test | 2025 | LVK, PRL 135, 111403 (Crossref); LIGO release 10 September 2025 (re-read 29 Sep 2026) | verified. Schwarzschild areas for those masses 123,700 + 113,600 = 237,400 km^2 (computed)

## How Skyfold draws a black hole
- One lens at a time; a 512-node deflection table rebuilt as the observer's radius changes; stars, the Galaxy's glow, galaxies and the CMB map lensed; second and further images; clocks, hovering, orbits and falls exact | - | docs/data/blackholes.md sections 4 and 10 | verified (repository)
- Spin: the EHT's Sgr A* Paper I: Kerr shadows deviate by -0.08 <~ delta <~ 0 (smaller by less than about 8% on average) | 2022 | EHT Sgr A* Paper I, Table 1 notes | verified
- Viewing angle: the flares' orbit is inclined i = 154.9 +/- 4.6 deg (polarimetry alone 157 +/- 5), i.e. about 25 deg from face-on | 2023 | GRAVITY Collaboration, A&A 677, L10 (2023), arXiv:2307.11821 text, Table 2 (read 29 Sep 2026) | verified
- Kerr shadow (Bardeen's outline, as given in Cunha & Herdeiro, GRG 50, 42, 2018, section 3), seen from far away: at 25 deg, a = 0.9: area-equivalent radius 5.0% smaller, width 5.9% narrower, centre 0.87 M off; a = 0.94: 5.7%, 6.7%, 0.93 M; a = 0.998: 6.8%, 8.3%, 1.03 M; edge-on a = 0.998: 5.0% smaller on average, 12.4% narrower, 2.44 M off | - | computed (29 Sep 2026; agrees with a second, independent calculation of the same outline) | verified. Article: "about 5 to 7% smaller and shift it by about half a horizon radius" at 25 deg; "up to about 12% narrower in one direction ... though only about 5% smaller on average" edge-on (the wording of label 1 in docs/data/blackholes.md section 3, which the cards use too)
- Labels stated: no spin; the flow a model; the nuclear-cluster stars a statistical model, only S2, S29, S38 and S55 real; no dust; M87's starlight a smooth model; one lens at a time; four X-ray binaries' orbital tilts assumed; contested masses | - | docs/data/blackholes.md section 3 (labels 1, 12, 14, 15, 17, 18, 20, 22) | verified (repository)
- Keck's mass for Sgr A* 3.975e6, 7.5% below GRAVITY's 4.297e6 | 2019 | Do et al., Science 365, 664 (2019), Table 1; computed | verified

## What comes next (status 29 September 2026)
- EHT M87* campaign: "Beginning in March 2026 ... a two-month observing campaign aimed at obtaining the first time-resolved sequence of images"; objectives include constraining the spin; no results found | - | Keuper & Mościbrodzka, arXiv:2609.11609 (submitted 10 Sep 2026) | verified
- ngEHT: roughly 10 new dishes; movies; no construction date | - | https://www.ngeht.org/about | verified
- BHEX: proposal to NASA's Small Explorer programme "in mid-2026", launch aim 2031; prototype subsystems tested (December 2025 campaign, reported 16 April 2026); no selection announced. NASA's 2026 Astrophysics SMEX call: released 9 June 2026, proposals due 9 September 2026, one investigation to be selected | - | blackholeexplorer.org ("will propose it as a NASA Small Explorer Mission in 2026"); MIT Haystack news ("in mid-2026"); NASA Science, "Announcement of Opportunity SMEX 2026" (opened 29 Sep 2026); a web search found no selection | verified (plans)
- Photon ring not yet measured; its shape set by mass and spin | - | Johnson et al. 2020 | verified
- S301: announced 19 August 2026; about 12 au (1.78 billion km) at closest; 8.7-year orbit; next pericentre 2031; spin hoped for "within the next 10 years"; follow-up with MICADO on the ELT; "Observing at least two complete orbits of S301 allows its trajectory to be constrained with high enough precision" to determine the spin | 2026 | ESO eso2612 (re-read 29 Sep 2026) | verified. The article had said the 2031 pass "may show how fast the black hole spins"; the release needs at least two orbits, and the article now says so
- ELT: first test observations 2029 | - | elt.eso.org timeline | verified
- Gaia DR4 due 2 December 2026, with epoch astrometry; "Future Gaia releases will likely facilitate the discovery of dozens more" dormant black holes | - | ESA release scenario; El-Badry et al. 2023 abstract | verified
- Roman launched 30 August 2026; the Galactic Bulge Time-Domain Survey will find isolated stellar-mass black holes from long microlensing events | 2026 | NASA Roman blog, "NASA concludes Roman Space Telescope launch coverage" (30 August 2026: "successfully launched aboard a SpaceX Falcon Heavy rocket"), https://science.nasa.gov/blogs/roman/2026/08/30/nasa-concludes-roman-space-telescope-launch-coverage/; NASA GBTDS page | verified
- LVK: in upgrades; six-month IR1 run from early to mid November 2026; O5 in discussion | - | observing.docs.ligo.org/plan (3 September 2026 update) | verified
- LISA: three spacecraft 2.5 million km apart; launch planned 2035 | - | ESA LISA factsheet | verified
- GN-z11: black hole of log M = 6.2 +/- 0.3 (about 1.6 million solar masses) accreting at about five times the Eddington rate; universe 435 million years old at z = 10.6 (Planck 2018) | 2024 | Maiolino et al., Nature 627, 59 (2024), arXiv:2305.12492 abstract; computed (re-computed 29 Sep 2026 with scipy: 436 Myr with radiation, 438 without, H0 67.66, Omega_m 0.3097) | verified. The abstract finds the mass consistent with heavy seeds or with light seeds growing in super-Eddington bursts, so "unexplained" became "not settled", and "growing about five times faster than the glow of its infalling gas ought to allow" became "growing at about five times the Eddington limit, the rate at which the light of infalling gas starts to hold the rest off"

## Videos (checked 29 Sep 2026: oEmbed title and channel, watch-page lengthSeconds)
- zUyH3XhpLTo | "How to Understand What Black Holes Look Like" | Veritasium | 9:18 | verified
- 6akmv1bsz1M | "Something Strange Happens When You Follow Einstein's Math" | Veritasium | 37:02 | verified
- e-P5IFTqB98 | "Black Holes Explained – From Birth to Death" | Kurzgesagt – In a Nutshell | 5:56 | verified
- 4rTv9wvvat8 | "What would we see if we fell into a Black Hole?" | ScienceClic English | 14:53 | verified
- KePNhUJ2reI | "How Time Becomes Space Inside a Black Hole | Space Time" | PBS Space Time | 15:28 | verified
- qPKj0YnKANw | "Hawking Radiation" | PBS Space Time | 12:05 | verified
- chhcwk4-esM | "NASA Simulation’s Plunge Into a Black Hole: Explained" | NASA Goddard | 4:20 | verified
- pkTWO0crVng | "ESOcast 199 Light: Astronomers Capture First Image of a Black Hole" | European Southern Observatory (ESO) | 1:42 | verified
- BIvezCVcsYs | "How to take a picture of a black hole | Katie Bouman" | TED | 12:51 | verified
- QyDcTbR-kEA | "The Sound of Two Black Holes Colliding" | LIGO Lab Caltech : MIT | 0:12 | verified
- xF3017r3dV4 | "Does the Milky Way central black hole rotate? This star could tell us" | ESO Chasing Starlight | 7:27 | verified
- x1TX8DYM5Ew | "Black Hole Imaging, by Jean-Pierre Luminet" | Jean-Pierre Luminet | 55:16 | verified
- DpPFn0qzYT0 | "Nobel Lecture: Roger Penrose, Nobel Prize in Physics 2020" | Nobel Prize | 34:03 | verified

## Books (Open Library, 29 Sep 2026)
- K. S. Thorne, Black Holes and Time Warps (W. W. Norton, 1994) | OL3902081W | verified
- M. Bartusiak, Black Hole (Yale University Press, 2015) | OL21579305W | verified
- B. Smethurst, A Brief History of Black Holes (Macmillan, 2022) | OL30928814W | verified
- J. Levin, Black Hole Blues and Other Songs from Outer Space (Knopf, 2016) | OL20030076W | verified
- J.-P. Luminet, Black Holes (Cambridge University Press, 1992) | OL3057623W | verified
- K. S. Thorne, The Science of Interstellar (W. W. Norton, 2014) | OL19993476W | verified
- S. S. Gubser & F. Pretorius, The Little Book of Black Holes (Princeton University Press, 2017) | OL19733226W | verified
- E. F. Taylor, J. A. Wheeler & E. Bertschinger, Exploring Black Holes, 2nd edition, free under CC BY 4.0 | https://www.eftaylor.com/exploringblackholes/ | verified

## Adversarial fact-check pass (29 Sep 2026)
Every claim in the draft was checked against the source named above; the changes it made:
- "Michell ... read at the Royal Society on 27 November 1783" -> no reading date given (the printed header and Montgomery et al. disagree)
- "Above it, nothing he knew of could stop a collapse" (Chandrasekhar 1931) -> "Above it, the electrons cannot hold the star up" (the 1931 note claims no more)
- "Oppenheimer and his student Hartland Snyder" -> "Oppenheimer and Hartland Snyder" (the relationship was not checked in a source)
- "no real system of stars could be packed inside" -> "no real body could be squeezed inside" (Norton's reading of Einstein 1939)
- Finkelstein "rewrote the solution in a form that follows light falling in" -> "in new coordinates" (the abstract says only a transformation of coordinates)
- "its electric charge, which in nature is too small to matter" -> "its electric charge" (no source checked for the second half)
- "heats to millions of degrees" -> "grows hot enough to shine in X-rays" (the source cited gives no temperature); "a strong X-ray source" -> "an X-ray source"
- "Uhuru ... from a platform off the coast of Kenya" -> "from Kenya" (HEASARC says "the San Marco platform in Kenya")
- Mandl "persuaded Einstein that a star ... would be seen as a ring" -> "pressed Einstein to publish the idea" (the idea was Mandl's; Einstein wrote the note at his insistence)
- The shadow's escape cone: "Synge's cone is the same disc seen from the other side" -> "the sky left outside that disc is the slender cone" (the escape cone is the complement of the shadow)
- "Light passing a black hole closer than sqrt(27) GM/c^2" -> "Light aimed to pass within sqrt(27) GM/c^2 of the centre" (b is the impact parameter, not the closest approach)
- "the rest of the sky ... crowded and blueshifted by your speed" -> "pushed forward by your speed" (overhead the sky is redshifted by half at the horizon, so "blueshifted" is wrong in part)
- "like landing on a flat plane, in the words of Andrew Hamilton" -> "which Hamilton likens to landing on a flat plane" (a paraphrase, not his words)
- M87* "from Earth it looks almost as big" -> "a little smaller" (39.7 against 53.3 uas)
- "exactly the view" of M87* from 6,400 au -> "the same view" (the geometry, not the surroundings)
- Spin: "its area would shrink by only about 5%" -> "only about 5% smaller on average" (5% is the area-equivalent radius; the area itself shrinks by about 10%); the EHT's bound stated as "on average"; the viewing angle given its source (GRAVITY 2023, Table 2)
- The Kerr-shadow source: Bardeen (1973), a conference chapter whose ADS page refuses scripts, replaced by the open review of Cunha & Herdeiro (2018) that gives his outline; the percentages recomputed here
- "The fall ... the dark patch at the horizon measures 42.13°" -> "just inside the horizon" (the app's measurement was at r = 1.995 M)
- Our galaxy (cross-article): "the shadow grows faster than the distance shrinks" was drafted for the new link and removed as false (close in the exact shadow is smaller than the far formula until about 1.5 r_s)

## Second adversarial fact-check (29 Sep 2026, 14:30-15:20 CDT)
Every factual claim and number in the article was checked again against a source opened for this pass (primary where one exists: the 1935 Observatory page images, Michell's 1784 text, the 1799 and 1808 editions of Laplace, Chandrasekhar 1931, the APS abstracts of Oppenheimer-Volkoff, Oppenheimer-Snyder, Finkelstein, Penrose, Hawking 1971 and Bekenstein 1973, Kerr's memoir, Renn & Sauer, Luminet 2019, Dyson et al. 1920, the arXiv or journal abstracts of every paper cited from 1999 on, the nature.com abstract pages of Webster & Murdin and Bolton 1972, GRAVITY 2020 and 2022, EHT M87 Paper VI and Sgr A* Papers I and V, the ESO, ESA, NASA, LIGO, MPIfR, ICRAR, Haystack, BHEX, ngEHT, LVK and Nobel pages, and the NASA SMEX 2026 page), and every number the article gives about what the app shows was measured in the app.

App checks: a browser tab on the development server, 1,280 x 800 CSS (canvas 2,560 x 1,384 at pixel ratio 2), 29 Sep 2026 19:33-20:10 UTC, each see-it run through runScene (and one through the article's own button) and read from lensBodies.holeView, the controller, the fall and the bodies' lens states; the machine was shared with other work (timings not needed here):
- sgr-a-star-shadow: r = 20 M (10 r_s, 0.848 au); shadow 28.538 deg; Einstein ring 59.657 deg; clock 0.94868; 3,806.3 g | matches
- sgr-a-star-einstein-ring: r = 100 M (4.241 au); ring 24.586 deg; with the app's staticSweep the mirrored sky ends at 3.0349 deg and the edge is at 2.9486 deg | matches
- photon-ring: r = 6 M; the view's centre 45.000 deg from the hole; the band to 45.637 deg (0.637 wide), the next copy to 45.027 deg | matches
- dive-and-climb: 28.538, 6.579 and 114.467 deg across at beta 0, 0.9 in, 0.9 out, clock paused | matches
- sgr-a-star-flyby: r = 10 M, beta 0.9; 25.774 deg across, centre 61.32 deg from the hole's direction = 28.68 deg from straight ahead | matches
- isco-orbit: r = 6 M, v 0.5c, no thrust (7.8e-12 g); omega 0.0032148 rad/s = 32.57 min a turn distant, 23.03 min aboard; shadow 81.787 deg, 22.208 deg forward | matches
- hover-at-the-horizon: r = 2.02 M, 126,901 km up; sky disc 14.830 deg in radius; clock 0.09950; 3.557 million g | matches
- fall-into-sgr-a-star: 812.57 s of proper time to 2 r_s in 20 s, then 79.79 s at 0.9973 s a second; horizon at tau 864.168 s; end at tau 892.358 s, r = 0.0207 M, tides 1,000 m/s^2, 0.030 s before the centre; dark patch 84.27 deg at r = 1.996, 106.54 at r = 1.00004, 168.4 at the end; the camera then hovers at 20 M again | matches
- s2-behind-sgr-a-star: 300 au; S2 119.5 au behind; images 0.810 and 0.675 deg from the centre, magnifications 3.19 and 2.19 (5.38 together); 7,752 km/s; warp 1,800 | matches
- sgr-a-star-flow: r = 20 M on the line to the Sun; the screen's mean brightness peaks at 14 deg (247 of 255, against 240 at 13 and 243 at 16), brighter on one side; inside the shadow 205-240, not dark; exposure ln E = -13.3 | the caption now says the gas hazes over the shadow and its light peaks in a ring just outside the edge
- m87-star-close: 1,000 au = 7.793 r_s; 36.270 deg; clock 0.93364; 4.210 g; tides 1.0e-12 m/s^2 | matches
- go:sgr-a-star: 4,000 au; shadow 0.0063 deg, Einstein ring 0.748 deg; the flow's point V -11.35, drawn as a saturated spot about 15 device px across | matches
- go:m87-star: see the go:m87-star line above
- go:gaia-bh3, go:cyg-x-1, go:ogle-2011-blg-0462: all framed at 10,000 r_s, Einstein ring 1.629 deg; at Gaia BH3 the giant sits 2e-5 deg from the line through the hole and its light makes a ring 0.816 deg in radius (V -27.7); at Cygnus X-1 the supergiant sits 37.8 million km behind the hole, 48.5 deg across | the two captions now say so
- sky-from:gaia-bh1: 2.68 million km; ring 0.519 deg, V -7.47, drawn as a ring 7 device px in radius with a dimmer centre; clock paused, the line holds 4.9 s; the Sun alone V 13.2 from there | matches
- sky-from:sgr-a-star: ring 0.473 deg, V -4.28 by holeSky, but the whole view is white and the ring cannot be seen | block removed
- Distances as drawn: Gaia BH1 1,566 ly, Gaia BH3 1,924 ly (the card's 590.6 pc is 1,926), Cygnus X-1 7,241, OGLE-2011-BLG-0462 4,958, Sgr A* 26,996, M87* 54.5 million | match the article's rounded values

What the app does not show that the captions had promised, and how the text changed:
- The sky within a few parsecs of Sgr A* is drawn nearly white (docs/data/blackholes.md section 9), so the Milky Way's band cannot be seen bending into the Einstein ring at 10 or 50 r_s. The captions of sgr-a-star-shadow and sgr-a-star-einstein-ring (and Our galaxy's see-it of sgr-a-star-shadow) now give the ring as the place where light from straight behind arrives, and describe what does show: the cluster's stars crowding round the shadow's edge. The scenes' own notes (src/content/scenes.ts) now say the same. Since then (29 September, evening) the view is stopped down for the cluster's glare (render/lens/skyMeter.ts), so that sky shows grey, not white (mean 116/255 at 20 M, 174 at 100 M, 131 in sky-from:sgr-a-star), but the cluster's glow is still even all round, and the Sun's ring in sky-from:sgr-a-star shows only 5/255 above the sky: its block stays out
- The Event Horizon Telescope's pictures are not in the tree; Sgr A*'s card links to ESO's page. "beside the collaboration's own picture" -> "to compare with the collaboration's own picture"

Other changes this pass made:
- "Eddington spoke next" -> "After a comment from Edward Milne, Eddington"; "a few kilometres across" -> "its radius was a few kilometres" (Observatory 58, 37-38)
- "the shape of space and time around a black hole has been known exactly since 1916" -> "around a black hole that does not spin" (Kerr's solution came in 1963)
- Timeline: 1972 "something too heavy to be a neutron star" -> "a heavy companion that gives off no light"; "1979: Luminet publishes a hand-drawn picture" -> "1978: Luminet computes a black hole and its disc of gas and draws the picture by hand"
- "The shrinking cone is the first appearance of what this article calls a black hole's shadow" -> "The edge of that shrinking cone is the edge of" it (the cone is the shadow's complement, and "first" was unsourced)
- "As the Nobel committee put it" and "The Nobel committee ... called black holes a robust prediction" -> the prize announcement and its citation ("black hole formation is a robust prediction"), which the Royal Swedish Academy of Sciences issues
- Myth: "864 s for someone dropped into Sgr A* from ten times its horizon's radius" -> "864 s from ten horizon radii ... for someone dropped from rest far away" (dropped from rest at 10 r_s it would take 2,074 s)
- "The spinning black hole was already known" -> "The geometry round a spinning black hole had already been found" (in 1963 it was not yet read as a black hole)
- Cygnus X-1, ESPRESSO, GW150914, Luminet, the photon rings' ratio, M87*'s ring, S301, BHEX and GN-z11: see their lines above
- "every black hole looks the same at the same number of horizon radii" -> "bends light and slows clocks in the same way" (the surroundings differ)
- Rings of the EHT: "found the ring the same size, 43.9" after "42" -> "a ring of the same size within the errors, 43.9 ... in all three years"
- Myth "you still see most of it as you cross" -> "all of it round a dark patch ahead" (every direction of the sky has an image; the dark patch covers 13 % of the view at the horizon)
- How Skyfold draws: "a table of 512 numbers" -> "tables of 512 steps" (FWD_NODES and INV_NODES in physics/schwarzschildTables.ts); "checked against an independent ray tracer: ... 42.13° against 42.15° expected" -> "match an independent ray tracer on 99.99% of their pixels or more" (the 42.15 is the exact formula, not the ray tracer)
- Four X-ray binaries: "The tilts on the sky ... are assumed" -> "How ... are turned on the sky is assumed" (their inclinations are measured; the node's direction, the sense and the circular orbit are assumed: docs label 15); likewise Cygnus X-1's orbit "turned on the sky ... taken from the jet"
- The photon ring "whose shape depends almost only on the mass and spin" -> "whose size and shape carry the imprint of its mass and spin" (Johnson et al. 2020 abstract; BHEX: "The properties of the black hole are imprinted on the size and shape of the photon ring"); the viewing angle matters too
- Videos: Veritasium's 9:18 "days before the first EHT image" -> "to explain the first EHT image" (its description opens "We have just seen the first image of a black hole"); NASA's plunge "a black hole the size of Sgr A*" -> "as heavy as" (4.3 million solar masses); Penrose's lecture "in his own hand-drawn slides" -> its title's subjects; PBS's Hawking Radiation "what the popular picture gets wrong" -> "why a black hole should glow" (the claims were not in the descriptions)
- Books: Bartusiak "including who really said 'black hole' first" -> "including the search for who first said" (nobody knows: Siegfried 2013)
- Word count kept within 6,000 by trimming (5,996)

Checked and unchanged: every other number and quotation above; the video lengths, titles and channels again through the watch pages (all 13 unchanged); the new footnote URL (NASA SMEX 2026) opened with HTTP 200 and the title "Announcement of Opportunity SMEX 2026 - NASA Science".

## Link check (29 Sep 2026)
- 117 URLs opened: 50 DOIs resolved in Crossref with matching titles, journals, volumes and pages (and through doi.org); 10 arXiv ids through the arXiv API with matching titles; 13 YouTube videos through oEmbed and the watch page (titles set to the exact YouTube titles for PBS Space Time and TED); the other 44 returned HTTP 200 with the expected page titles or PDFs | n/a | curl with a desktop user agent | verified
- ADS scans (adsabs.harvard.edu/pdf/...) answered 504 or timed out intermittently and 200 with the PDF on retry; kept, as in the other articles | n/a | n/a | verified
- Open access marked only where the licence (CC BY in Crossref) or the journal (New Journal of Physics, Science Advances) or a free arXiv or ADS copy was seen | n/a | Crossref licence fields | verified
- Minimums: Papers 25, Books 8, Videos 13, Online 9 | n/a | n/a | verified

## Edit pass (29 Sep 2026)
- Banned words and moves checked by script: none left ("imagines" in the timeline changed to "describes"); no em-dashes; no rhetorical questions; British spelling
- One direct quotation per section at most: the opening (Eddington), Dark stars (Michell), A solution from the front (Einstein to Schwarzschild), The star that cannot find peace (Oppenheimer and Snyder's abstract), A one-way surface (Kerr), What a black hole looks like (Einstein to the editor of Science)
- Every display equation (five) followed by "In words:" and a worked example with real numbers
- Body 5,959 words by the catalogue's countWords (4,500 to 6,000); 18 see-it blocks, all eleven new named scenes among them; four myth blocks. After the second fact-check: 5,996 words, 17 see-it blocks (sky-from:sgr-a-star removed), all eleven named scenes still used
- Section "What a black hole looks like" kept under that title: the "double images" hint's Read more opens it (src/ui/explainerActions.ts)

## Cross-article consistency pass (29 September 2026)
- Sgr A*: this article uses GRAVITY 2022 (4.297 million, 8,277 pc) as the app does; Our galaxy computes the far-away shadow at GRAVITY 2019's 8,178 pc (54 uas) and says which distance it uses; this article's 53 uas is at 8,277 pc | consistent (stated)
- Spin wording reconciled in Our galaxy (its "less than about 8%" kept as the EHT's average, with the computed 5-7% at our 25 deg viewing angle and 12% edge-on), matching the card, the data sheet and docs/data/blackholes.md | changed
- Gaia BH1: How far are the stars? now gives 9.27 solar masses (9.62 in the discovery paper), as the card; its 480 pc and 186 days agree | changed
- S301, BHEX, Gaia DR4, Roman's launch, the EHT's 2026 campaign: the same sources and dates as Our galaxy and What you would see near the speed of light | consistent
- Cross-links added: Our galaxy (after its shadow derivation, with a sgr-a-star-shadow see-it), How far are the stars? (a go:gaia-bh1 see-it), What you would see near the speed of light (the M87 ring), Time dilation is real (the end of "Gravity joins in") | added
- Front matter: shelf galaxies, order 14; Island universes 15, The expanding universe 16, The edge of reach 17; orders unique within each shelf and overall (a test in catalogue.test.ts now holds the first) | changed

## Link check, second pass (29 Sep 2026, 15:27-15:45 CDT)
Every link in the article and in this file opened again after the second fact-check, with curl (a desktop browser's user agent, redirects followed, 40 s timeout, up to three tries), run three times (before the changes below, after them, and after this record was written):
- 146 items in the last run, none failing: the 120 URLs of the article and this file (54 DOIs, 8 arXiv pages, 13 YouTube videos, 45 other pages and PDFs) and 26 identifiers this file names without a URL (15 arXiv ids, 7 Open Library works, 4 archive.org items) | n/a | curl; Crossref, arXiv, YouTube oEmbed, Open Library and archive.org APIs | verified
- DOIs: each registered at doi.org (a redirect to the publisher) and matched in Crossref on title, journal, volume, first page or article number, and year | n/a | Crossref | verified
- arXiv: title and first author through the arXiv API, and every abs page 200; the API gave journal DOIs for two papers cited by arXiv id alone (changed below) | n/a | export.arxiv.org | verified
- YouTube: oEmbed titles and channels match the list exactly; watch pages playable (status OK) with the lengths listed, all 13 unchanged | n/a | oEmbed; watch pages | verified
- Books: the seven Open Library works give the titles, authors, publishers and years listed; Exploring Black Holes' page is 200 and says "Creative Commons Attribution 4.0 International License" | n/a | Open Library; eftaylor.com | verified
- Web pages: all 200 with the expected titles, and each HTML page's text searched for the fact it is cited for, all found (for example the Nobel 2020 release's "did not himself believe", NASA's "frozen stars" and "If you have the choice", Hamilton's "flat plane" and "tenth of a second", ICRAR's 7,200 light-years and Hawking's 1990 concession, eso2612's "two complete orbits", Gaia's "December 2026", the LVK plan's IR1 "beginning early- to mid-November of 2026", LISA's 2035 and 2.5 million km); bylines and dates of the dated footnotes as given (Percy 19 February 2021, ICRAR 19 February 2021, Todd 5 June 2024, NASA 6 May 2024, ESA 16 April 2024, eso1907 10 April 2019, eso2612 19 August 2026, MPIfR 16 September 2025, Haystack 16 April 2026, LIGO 11 February 2016, 10 September 2025 and 18 November 2025, Siegfried 23 December 2013) | n/a | the pages | verified
- PDFs downloaded and opened: the ADS scans of The Observatory 58, 33 (9 pages; p. 38 rendered, with "the star can at last find peace" and "a law of Nature"), Chandrasekhar 1931 (2), Synge 1966 (4), Luminet 1979 (8; first page rendered) and Montgomery et al. 2009 (7), all 200 this time; Renn & Sauer's Preprint 160 (28 pages) and Norton's preprint (107) | n/a | ADS; MPIWG; Pitt | verified
- The Event Horizon Telescope's own site is not linked (it refuses scripts); its news is cited through ESO (eso1907; eso2208 opened too, 12 May 2022) and MPIfR | n/a | n/a | verified

Changed:
- [^sahu2025]: arXiv:2503.07820 -> the published paper, ApJ 983, 104 (2025), https://doi.org/10.3847/1538-4357/adbe6e (CC BY 4.0; its abstract gives the same 7.15 +/- 0.83 solar masses, 1.52 kpc and 51.1 km/s)
- [^eht2025]: arXiv:2509.24593 -> A&A 704, A91 (2025), https://doi.org/10.1051/0004-6361/202555855 (CC BY 4.0; the same 43.9 +/- 0.6 uas)
- [^norton2023] -> [^norton2024]: the 2023 preprint -> the published, open version, Philosophy of Physics 2, 13 (2024), p. 14, https://doi.org/10.31389/pop.91 (the passage was on pp. 19-20 of the preprint)
- [^romanblog]: the blog's front page, from which the launch posts will scroll away -> the post "NASA concludes Roman Space Telescope launch coverage" (30 August 2026), which The expanding universe and The edge of reach also cite
- [^ngeht]: "About the ngEHT" -> "Concept", the page's own title (as What you would see near the speed of light cites it)
- [^smex2026]: "Announcement of Opportunity: SMEX 2026" -> the page's heading, "Announcement of Opportunity Astrophysics Explorers Program 2026 Small Explorer (SMEX) final text released" (12 June 2026)

Checked and left as they are:
- Renn & Sauer's preprint was published in A. Ashtekar et al. (eds.), Revisiting the Foundations of Relativistic Physics (Kluwer, 2003), 69-92, https://doi.org/10.1007/978-94-010-0111-3_5 (resolves), behind a paywall; the free preprint stays, since its pages are the ones cited
- Luminet 2019, Kerr 2007, Herdeiro & Lemos 2018 and Keuper & Mościbrodzka 2026: no DOI found in the arXiv API or by a Crossref search; their arXiv links stay
- Our galaxy, How far are the stars? and Island universes still cite the Roman blog's front page ("posts of 30 August to 25 September 2026"); left for their own passes

## Final edit and consistency pass (29 Sep 2026, 16:00-16:45 CDT)
The article read aloud end to end against the house voice rules; the maths checked as the Learn view renders it; the footnotes counted; every see-it run again in the app and its caption compared with what shows; and the article's numbers, names and spellings compared with the cards (src/sim/blackholes/blackholes.json, the Sgr A* and M87 records), the Guide (src/ui/docs/GuideDoc.tsx), the hints (src/content/explainers.ts) and the other articles. No fact, number or source changed.

Voice and structure (no banned words, em-dashes, question marks or American spellings left, checked by script):
- The timeline's title "Black holes, from a letter to a film" (a from-X-to-Y sweep) -> "Building the case"; its 1964 line "black hole" -> "black holes" (the words Ewing printed, as the body says); its 1978 line -> "computes what a black hole with a disc of gas looks like and draws it by hand"
- "Sgr A*" introduced as the short name at first use; Robert Oppenheimer named in full at his first appearance in the body; escape speed defined where it is first used ("the slowest throw that never falls back"); gravitational waves glossed ("ripples in space and time")
- "Einstein replied" -> "He sent it to Einstein, who replied" (MacTutor: he sent the first paper to Einstein); "a note signed on 12 November 1930" -> "dated" (the note carries a date; no signature was checked)
- "The edge of that shrinking cone is the edge of what this article calls a black hole's shadow" -> "Where that range ends, a black hole's shadow begins" (no cone had been named, and the phrase talked about the article)
- Cygnus X-1: "followed that star's spectrum. It swung" -> "tracked that star's speed. It swung" (the star swung, not the spectrum); Gaia BH1: "Gaia's measurements" -> "the Gaia satellite's measurements", "Precise radial velocities" -> "Precise speed measurements"
- Luminet: commas added so that the IBM 7040 no longer reads as holding the disc of gas
- Trimmed: "in order to", "his colleague" (Schild), "in Berlin", "a rare disease of the skin" -> "a rare skin disease", "put it simply:" -> "advises:", "car registration plate" -> "number plate", "a fifth of an astronomical unit" -> "a fifth of an au" (au is used from the Schwarzschild section on), "as Skyfold uses" -> "as in Skyfold"; the body's 1.3 mm sentence shortened (the see-it says what to compare it with)
- How Skyfold draws: the four X-ray binaries' assumed orientations moved out of "One lens at a time" into a bullet of their own
- go:sgr-a-star's caption now gives the card's own units too ("22.7″ and 44.9′ on the card": the card shows the shadow in arcseconds and the ring in arcminutes); fall-into-sgr-a-star's caption now says the fall "resets to where it began" (sim/fall.ts endFall puts the camera back hovering at r0 with home's clock kept)
- 5,997 words by the catalogue's countWords (5,996 before); pitch 149 characters; 12 sections; 17 see-it blocks, all eleven named scenes among them; four myth blocks; five display equations, each followed by "In words:" and a worked example

Maths: all 43 formulas (5 display) typeset by KaTeX with no errors in the Learn view. At 1,280 px wide two commas after inline formulas (after the shadow's α and after 8πGMk_B = 0.0461) wrapped onto the next line on their own: the maths plugin leaves a line break between a formula and the punctuation after it. A comma or full stop that follows a formula now sits inside it (14 places), and the two colons after formulas became ", so" and ","; checked again at 1,280 and 420 px: no punctuation wraps, and no formula or table is wider than the column at 420 px. The renderer is unchanged (src/content/learn/mathPlugin.ts; the other articles have the same pattern).

Footnotes: 88 defined, every one used, none undefined. In the table the footnotes now sit on the figure each supports (they were grouped after each cell and rendered out of order, "37, 36").

See-its in the app (a browser tab on the development server, 1,280 x 800 CSS at pixel ratio 2, 29 Sep 2026 21:10-21:45 UTC, read from the lens state, lensBodies.holeView and screenshots; the machine busy with other work):
- go:sgr-a-star: 4,000 au; shadow 0.0063 deg across, Einstein ring 0.748 deg; the card: "shadow 22.7″ across · Einstein ring 44.9′ across"; the flow's point a saturated spot about 16 device px across at the centre, larger than the cluster's stars round it, on a near-white sky | matches (caption given the card's units)
- sgr-a-star-shadow: r = 20 M; 28.538 deg; ring 59.66 deg; clock 0.94868; the cluster's stars crowd round the shadow's edge; the band cannot be seen | matches
- sgr-a-star-einstein-ring: r = 100 M; ring 24.586 deg; shadow 5.897 deg (edge 2.949) | matches
- photon-ring: r = 6 M; shadow 90.000 deg across (edge 45.000) | matches
- dive-and-climb: 28.538, 6.579, 114.467 deg | matches
- sgr-a-star-flyby: r = 10 M; 25.774 deg across, 61.32 deg from the hole's direction = 28.68 deg from straight ahead | matches
- isco-orbit: r = 6 M, circular; 81.787 deg across, 22.208 deg forward; clock 0.70711; thrust 2.3e-11 g | matches
- sgr-a-star-flow: r = 20 M, flow on in visible light; a bright ring at the shadow's edge, the shadow hazed over, darkest off-centre | matches
- hover-at-the-horizon: r = 2.02 M; shadow 330.34 deg across, so the sky is a disc 14.83 deg in radius; clock 0.09950 | matches
- fall-into-sgr-a-star: ended by itself at tau 892.358 s, 28.19 s after the horizon, then hovering at 20 M again with home's clock kept (lastEnd.why 'ended'); the dark patch 85.8 deg across at r = 1.905 M and 109.1 at 0.919 M (sampled every 10 frames; 84.2 and 107 at 2 and 1 M, as measured to the frame in the second fact-check) | matches
- go:m87-star: r = 100 M (6,416 au); 5.897 deg; ring 24.586 deg; smooth beige starlight, no ring to be seen | matches
- m87-star-close: 1,000 au = 7.793 r_s; 36.270 deg; clock 0.93364; 4.210 g; ring 68.9 deg | matches
- go:gaia-bh3: 10,000 r_s (965,713 km); a ring about 1.6 deg across at the centre | matches
- go:cyg-x-1: 10,000 r_s (626,089 km); the supergiant's disc, drawn saturated white, fills much of the view | matches
- sky-from:gaia-bh1: 2.680 million km; ring 0.519 deg across, V -7.47; clock paused; the line holds 4.92 s | matches
- go:ogle-2011-blg-0462: 10,000 r_s | matches
- s2-behind-sgr-a-star: not run again (it moves the date); its numbers are the scene's note, which src/content/blackHoleScenes.test.ts checks (23 tests passed, 16:26 CDT)

Consistency with the rest of the app:
- The cards agree: Sgr A* (4.297 million, 27,000 light-years, the spin note's 5-7 % and about 1 M, the Keck mass 7.5 % lower), M87* (6.5 billion, 5.4 to 8.7 from its stars, 128 au, 43.9 uas), M87 (16.8 Mpc, 55 million light-years), Gaia BH3 (32.7, 590 pc, 1,930 light-years, 11.6 years, 4.5 to 29 au, 1/360 of the Sun's iron), Cygnus X-1 (2.22 kpc, 7,200 light-years, 21 and 41, spin above 99.8 %), OGLE-2011-BLG-0462 (7.15, 1.52 kpc, 5,000 light-years, 51 km/s, the 0.1″ position), GN-z11 (435 million years)
- The Guide agrees: eleven black holes; the ring 0.75 deg across from 4,000 au and the shadow 28.5 deg at ten horizon radii; the spin wording (less than about 8 % on average, about 5 to 7 % and 1 M at our 25 deg, up to about 12 % narrower edge-on); the fall's pacing (20 s, then 80 s in real time) and home's clock as a convention; clocks 1.054 and ten times; the models' labels (flow, nuclear cluster, M87's starlight, no dust)
- The hints agree: 'double-images' and 'shadow-size' (2.6 horizon radii; half the sky at 1.5)
- The other articles agree: Our galaxy (its 54 uas at 8,178 pc and this article's 53 at 8,277, each distance stated; the sgr-a-star-shadow caption), How far are the stars? (9.27 solar masses, 186 days, 480 pc, 1,570 light-years), Time dilation is real (ten times slower 1 % above the horizon, a thousand times at the closest), What you would see near the speed of light (the M87 ring's beaming, the flyby), the shelf orders (Our galaxy 13, Black holes 14, Island universes 15, The expanding universe 16, The edge of reach 17)
- Differences in other files of the app, recorded to be put right in those files: (1) Gaia BH1's card says its star circles it "every 185 days" (185.6 in El-Badry et al.; this article and How far are the stars? say 186); (2) Cygnus X-1's card calls the companion "too heavy to be a neutron star", which this file could not confirm in the 1972 abstracts, and gives the 2025 mass as "17.5 (+2 −1)" where the paper's abstract gives 12.7 to 17.8 depending on the inclination (this article's "13 to 18"); (3) the Guide puts M87 "54 million light-years away" where its card, ESO and this article say 55 million (16.8 Mpc is 54.8 million); (4) the notes of the scenes sgr-a-star-shadow and sgr-a-star-einstein-ring (src/content/scenes.ts) still describe the Milky Way's band bending into the Einstein ring, which the near-white sky round Sgr A* does not show (docs/data/blackholes.md section 9)

Tests: src/content/articleScenes.test.ts, src/content/learn/catalogue.test.ts and src/content/learn/markdown.test.ts passed (3 files, 57 tests, 16:23 CDT); npx tsc -b clean; the full npx vitest run 1,671 of 1,672 tests, the one failure a timing limit in src/sim/stars/lensCandidates.test.ts (5 ms against its limit while other work loaded the machine), which passed (17 of 17) when run again alone.

## Corrections after a further check (29 September 2026, evening)

A further check of the app and the article (the physics, the words, and every see-it run in the app at 1,280 x 760, pixel ratio 2) led to these changes:

- Cygnus X-1's pair: "a fifth of an au apart" -> "a quarter of an au apart". Kepler's third law with 21.2 + 40.6 solar masses and the 5.5998-day period gives 0.244 au, the separation on the app's card | computed | corrected
- How Skyfold draws: "on 99.99% of their pixels or more" -> "on at least 99.99% of the pixels away from an edge": the comparison of the 16 reference pictures counts the pixels away from a boundary between classes in the reference (99.99-100 % of them; docs/data/blackholes.md section 11) | docs/data/blackholes.md | corrected
- sgr-a-star-einstein-ring: no ring shows in the diffuse light (the sky there is a flat 206-207/255 inside and outside it), but stars crowd inside a circle about 24° across. The caption now says the stars straight behind are pushed out to a circle 24.6° across, the Einstein ring, with the sky inside it mirrored and crowded | measured in the app | corrected
- dive-and-climb: climbing out the 114° shadow fills the screen; the caption adds "wider than the view" | measured in the app | corrected
- sgr-a-star-flyby: the shadow's centre, 28.7° from straight ahead, can lie beyond the edge of a wide view; the caption adds "towards the edge of the view: drag to see all of it" | measured in the app (fit: radius 12.4°, centre 30.2°) | corrected
- sgr-a-star-flow: the Event Horizon Telescope's pictures are not shipped with the app; Sgr A*'s card links to ESO's page instead, so the caption says the card links to the picture | the app | corrected
- s2-behind-sgr-a-star: S2 lines up behind the hole about 60 s after the scene starts; the caption says "within a minute" | measured in the app | corrected
- Our galaxy, galactic-centre-orbits: the bright point at the orbits' shared focus is the model of the gas falling in, and the S-stars are found by their labels against the cluster's bright glow; the caption says both | measured in the app | corrected
- sky-from:gaia-bh1: the Sun's ring, 0.519° across, is about 7 CSS pixels at the scene's fixed 50° field of view and reads as a bright point; the caption says so | measured in the app | corrected
- Maths: the renderer now keeps the punctuation after a short inline formula on its line (src/content/learn/mathPlugin.ts, a span that does not wrap), so the 16 commas and full stops set inside formulas as a workaround are back outside them, in house style; the colons reworded then stay reworded | the Learn view | changed

## Magnetic fields (added 9 October 2026)
- M87*'s ring is polarised in a spiral; the β2 phase between −163° and −129°; the polarimetric constraints favour magnetically arrested (MAD) models; field in the emitting gas about 1–30 G | 2021 | EHT Collaboration 2021, ApJL 910, L13, Table 2 and abstract (arXiv 2105.01173, re-read 9 Oct 2026) | verified
- Sgr A*'s ring polarised 24–28 % on average (up to about 40 %), in a spiral; MAD models favoured; the one model passing all constraints is MAD a* = 0.94, i = 150° | 2024 | EHT Collaboration 2024, ApJL 964, L26, Table 1 and Section 5.3 (re-read 9 Oct 2026) | verified
- The field lines drawn are a model (Blandford & Znajek 1977 paraboloidal field), not a measurement | - | MNRAS 179, 433 | model, labelled
