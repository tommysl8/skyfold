/**
 * The dark-matter card's chart (LayerCards.tsx): the Milky Way's circular speed against radius, as McMillan's (2017)
 * mass model gives it with its dark halo (the gold of the tracers that go round with it) and with its stars and gas
 * alone (the grey of the others), and as Eilers et al. (2019) measured it. Its own chunk, loaded with the card: the
 * model's curve is worked out on first use (sim/galaxy/darkMatter.ts, about 20 ms).
 */
import { useMemo } from 'react';
import { Plot, type PlotSeries } from '../plot/Plot';
import { circularSpeed, EILERS_2019, visibleSpeed } from '../../sim/galaxy/darkMatter';
import { DARK_COLOURS } from '../../sim/galaxy/darkLayer';

const css = (c: readonly number[]) => `rgb(${c.map((v) => Math.round(255 * Math.min(1, v))).join(',')})`;

export default function DarkMatterChart() {
  const series = useMemo<PlotSeries[]>(
    () => [
      { kind: 'fn', f: circularSpeed, color: css(DARK_COLOURS.withHalo), label: 'with the dark halo', domain: [0.5, 30], width: 1.4 },
      { kind: 'fn', f: visibleSpeed, color: css(DARK_COLOURS.visibleOnly), dash: '4 3', label: 'stars and gas alone', domain: [0.5, 30], width: 1.2 },
      {
        kind: 'points',
        data: EILERS_2019.points.map(([R, v, lo, hi]) => ({ x: R, y: v, sy: (lo + hi) / 2 })),
        color: '#d8dde3',
        label: 'measured (Eilers et al. 2019)',
      },
    ],
    [],
  );
  return (
    <div className="mt-1">
      <Plot x={{ q: 'R', unit: 'kpc', domain: [0, 30], ticks: [0, 5, 10, 15, 20, 25, 30] }} y={{ q: 'v', unit: 'km/s', domain: [0, 260], ticks: [0, 100, 200] }} series={series} height={132} />
    </div>
  );
}
