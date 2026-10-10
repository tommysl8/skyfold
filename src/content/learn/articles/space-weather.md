---
slug: space-weather
title: Storms from the Sun
pitch: A short note on coronal mass ejections, how they cross to Earth, and what happens when one arrives, from the real eruptions Skyfold shows.
shelf: solar-system
order: 11
updated: 2026-10-09
---

Now and then the Sun throws off a cloud of its own plasma and magnetic field, billions of tonnes of it, at hundreds to a few thousand kilometres a second: a coronal mass ejection, or CME. Coronagraphs on SOHO and STEREO see them leave, as faint sunlight scattered by their electrons, and NASA's Community Coordinated Modeling Center records each one's direction, speed and width in its DONKI catalogue.[^donki] Skyfold draws the fast ones and those that reached Earth, from 2010 on, as soft fronts flying out from the Sun on the date (View › Solar eruptions). Real ones are far fainter than drawn.

## The crossing

Once out of the corona a CME is no longer driven: the solar wind ahead of it drags a fast one back towards the wind's own speed, and pulls a slow one along. The drag-based model of Vršnak and colleagues puts that in one line, and it has a closed solution, so a CME's arrival can be worked out in an instant.[^dbm] With typical values it misses the measured arrival by about half a day on average; for each CME whose shock was measured at Earth, Skyfold fits the drag so that its front arrives when the shock did.

::: see-it gannon-storm
The Gannon storm of May 2024: one CME after another leaves the Sun, crosses to Earth in two days, squeezes the magnetosphere and spreads the aurora.
:::

## The hit

Ahead of a fast CME runs a shock, and behind the shock a sheath of compressed, hot plasma. When it reaches Earth it pushes the magnetosphere's sunward edge in, from about ten Earth radii towards six or five; on 10 May 2024 it came in to about five.[^hayakawa2024] If the sheath's or the CME's field points south, it joins Earth's and lets energy in, and a geomagnetic storm follows. The Kp index measures how strongly the field shakes, every three hours since 1932, from 0 to 9.[^kp] Skyfold's aurora follows the measured Kp of the date, and in great storms the ovals spread towards the equator: in May 2024, Kp 9, aurora was seen from Mexico and Namibia.

## The largest storm on record

On 1 September 1859 Richard Carrington and Richard Hodgson each saw a flare in a great sunspot group, the first ever recorded; 17.6 hours later the largest geomagnetic storm on record began, and aurora was seen from the tropics.[^cliver2004][^hayakawa2019] No coronagraph saw its CME, so Skyfold's is a model: the speed that crosses in 17.6 hours, with an assumed width.

::: see-it carrington-event
The Carrington event, its CME modelled from the 17.6-hour crossing.
:::

[^donki]: NASA Community Coordinated Modeling Center, DONKI (Database Of Notifications, Knowledge, Information): CMEs, their analyses, interplanetary shocks and geomagnetic storms, 2010–2026. https://ccmc.gsfc.nasa.gov/tools/DONKI/
[^dbm]: B. Vršnak et al., "Propagation of interplanetary coronal mass ejections: the drag-based model", Solar Physics 285, 295 (2013). https://doi.org/10.1007/s11207-012-0035-4
[^hayakawa2024]: H. Hayakawa et al., "The solar and geomagnetic storms in 2024 May: a flash data report", Astrophysical Journal 979, 49 (2025). https://doi.org/10.3847/1538-4357/ad9335
[^kp]: J. Matzka et al., "The geomagnetic Kp index and derived indices of geomagnetic activity", Space Weather 19, e2020SW002641 (2021); data from GFZ Potsdam (CC BY 4.0). https://doi.org/10.1029/2020SW002641
[^cliver2004]: E. W. Cliver and L. Svalgaard, "The 1859 solar–terrestrial disturbance and the current limits of extreme space weather activity", Solar Physics 224, 407 (2004). https://doi.org/10.1007/s11207-005-4980-z
[^hayakawa2019]: H. Hayakawa et al., "Temporal and spatial evolutions of a large sunspot group and great auroral storms around the Carrington event in 1859", Space Weather 17, 1553 (2019). https://doi.org/10.1029/2019SW002269
