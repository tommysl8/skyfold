<p align="center"><img src="public/og-image.png" alt="Skyfold: explore the real universe at nearly the speed of light" width="760"></p>

# Skyfold

*(Formerly Lightspeed.)*

Explore the real universe at nearly the speed of light, in your browser.

**[Open Skyfold](https://skyfold-space.vercel.app)**. Nothing to install, no sign-up.

<p align="center">
  <img src="docs/images/black-hole.jpg" alt="The Milky Way bent into a ring round the black hole Gaia BH3" width="49%">
  <img src="docs/images/milky-way.jpg" alt="The Milky Way seen from outside" width="49%">
  <img src="docs/images/saturn.jpg" alt="Saturn and its rings at true scale" width="49%">
  <img src="docs/images/relativity.jpg" alt="At 0.999c the whole sky crowds into a disc ahead" width="49%">
</p>

Skyfold is a map of the universe at true scale that you can fly around. The planets are where they are today.
3.75 million stars sit at their measured distances. Beyond them are the Milky Way, Andromeda, 55,877 galaxies of the cosmic
web and the afterglow of the Big Bang. Fly fast and special relativity takes over: the sky bunches up ahead of you,
colours shift and your clock falls behind Earth's. Get close to a black hole and its gravity bends the light of the
whole sky.

It started as a way to see what relativity actually looks like, and grew from there.

## Things to try

- **Take a journey.** One-click trips: race sunlight to Earth, ride to Saturn at 0.9c, catch up with Voyager 1, fly to
  the seven planets of TRAPPIST-1, or fall into the black hole at the centre of the Galaxy.
- **Roam.** Press `F` and fly anywhere, from low over the Moon to the edge of the cosmic web. Your speed scales with how
  close things are: about 15 seconds gets you out of the Solar System, and holding Shift gets you out of the Milky Way
  in about three.
- **Go anywhere by name.** Press `/` and type: Europa, Betelgeuse, K2-18 b, the Orion Nebula, Andromeda.
- **Visit a black hole.** Forty real ones, from Sagittarius A\* and M87\* to Gaia BH1, LMC X-1 and M31\*. The lensing is exact general
  relativity. Hover just above the horizon and watch your clock slow, or fall in.
- **Just look.** `Shift+F` hides everything but the view.
- **Read about it.** Learn has longer reads on the science behind what you're seeing, with their sources.

## Controls

| Key | What it does |
| --- | --- |
| Drag, scroll | Look around, zoom in and out |
| Click, double-click | Select something (a short card), go there |
| `/` or `Ctrl+K` | Where to? Search anything by name |
| `F` | Roam: fly anywhere. `F` or `Esc` to stop |
| `W` `A` `S` `D` or arrows | Move while roaming. `Space`/`R` up, `C` down, `Q` `E` roll |
| `Shift`, scroll or `+` `−` | Roam faster; set the pace |
| `Shift+F` | Clean full screen: the view and nothing else |
| `H` | Back to Earth |
| `G` | Plan a flight |
| `P`, `[` `]`, `N` | Pause, slow down or speed up time, back to now |
| `Z`, `X` | Relativistic optics on and off, split screen |
| `E`, `I` | Learn, the instrument panel |
| `T` `O` `L` `B` `J` `Y` | True scale, orbits, labels, small bodies, grid, constellations |
| `?` | Every key on one sheet |

On a touch screen, drag to look around and hold the arrows at the right edge to move.

## What's real

Almost everything you see comes from real measurements:

- **Solar System:** positions from Astronomy Engine and JPL Horizons; 1.47 million asteroids and comets from the JPL Small-Body Database, on their Kepler orbits.
- **Stars:** 3.75 million from AT-HYG, the Gaia Catalogue of Nearby Stars and Gaia DR3, with Gaia distances and motions.
- **Planets of other stars:** the NASA Exoplanet Archive.
- **Galaxies:** the Local Volume Database and Cosmicflows-4.
- **Galaxy surveys:** 13.5 million galaxies and quasars from DESI DR1 and the SDSS, placed by their redshifts, and
  0.87 million more quasars over the whole sky from Gaia (Quaia), drawn stretched by their rough distances.
- **Deep sky:** NGC/IC objects with measured distances (OpenNGC), ATNF pulsars, supernova remnants and gravitational-wave mergers.
- **Pulsars up close:** the neutron star, its radio beams (false colour, their width from the spin period) sweeping round as it turns, and its magnetic field; neutron-star pairs such as the Double Pulsar and the Hulse–Taylor binary on orbits sized by Kepler's law.
- **Black holes:** published measurements.

Where something has to be a model, such as the Milky Way seen from outside, the gas around Sagittarius A\* or the
colours of exoplanets nobody has seen, the app says so. [How it works](docs/technical.md) covers the physics and every
data set, and [docs/data](docs/data/) has how each one was built.

## Run it yourself

Needs Node 22.12+ or 24.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests (vitest)
npm run build    # static build to dist/
```

It is a static site with no backend: Vite, React, TypeScript and three.js through React Three Fiber. To deploy on
Vercel, import the repository; no configuration is needed.

## Credits

The data, maps and pictures come from NASA, JPL, ESA (Gaia, Hubble, Webb), ESO, NOIRLab, the AT-HYG catalogue, the
NASA Exoplanet Archive, the Cosmicflows and Local Volume teams, the Event Horizon Telescope and many papers.
[CREDITS.md](CREDITS.md) lists every source with its licence.

## Contributing

Bug reports, corrections and new ideas are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to run it, what a
good pull request looks like and the rules for adding data. Please also read the
[code of conduct](CODE_OF_CONDUCT.md).

## Author

Made by **Tommy S. Liu** ([GitHub](https://github.com/tommysl8), [LinkedIn](https://www.linkedin.com/in/tommysliu/)), who is
currently studying Electrical and Computer Engineering Honors at the University of Illinois Urbana-Champaign. Bug reports and ideas are welcome as
[issues](https://github.com/tommysl8/skyfold/issues) or by email at tommysliu8@gmail.com.

## Licence

- **Code:** [MIT](LICENSE). Use it for anything.
- **Data:** each data set keeps its own licence, listed in [CREDITS.md](CREDITS.md). Most are open (public domain, CC0,
  CC BY).
- **Non-commercial data:** the star, exoplanet-host and black-hole files are built from Gaia DR3 values, which ESA
  licenses as CC BY-NC 3.0 IGO, so those files are for **non-commercial use only**. The scripts that build them are MIT,
  so anyone can rebuild them from the original sources.
- **Citing:** GitHub's "Cite this repository" button uses [CITATION.cff](CITATION.cff).
