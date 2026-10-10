/**
 * The satellite swarm's note (viewport/LayerCards.tsx): what the points are, from when, and why they are hidden when
 * they are (loading, CelesTrak's answer, or a date too far from the elements). Shown while the View menu's
 * Satellites switch is on and the camera is near Earth.
 */
import { satellites, SHOWN_DAYS } from '../sim/satellites';
import { sim } from '../sim/sim';

/** The note shows within this distance of Earth (km): where the swarm can show. */
const CARD_KM = 4e6;

const dateOf = (jd: number) => {
  const d = new Date((jd - 2440587.5) * 86400000);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
};

export const SATELLITE_CARD = {
  title: 'Satellites',
  more: [
    'Grey-white: low orbit. Blue: Starlink, in shells between about 340 and 570 km; a string of beads close together is a batch launched days ago, still rising. Sand: medium orbit, the GPS, GLONASS, Galileo and BeiDou navigation satellites near 20,000 km. Amber: the geostationary ring, 35,786 km above the equator. Lilac: elliptical orbits. Rust: tracked debris (the Debris switch).',
    'Each satellite is placed by SGP4, the model its elements are made for, from the US Space Force’s catalogue as CelesTrak serves it. Satellites in Earth’s shadow are dimmed. Click one for its card and a short trace of its orbit.',
    'The points are a map, not what the eye would see: a satellite is a speck a few metres across, visible from the ground only near dusk and dawn.',
  ],
  credit:
    'Orbital elements: CelesTrak (Dr T. S. Kelso), GP data from the US Space Force’s space catalogue, fetched when this switch is first turned on and kept in your browser for two hours. SGP4: Vallado, Crawford, Hujsak and Kelso (2006).',
} as const;

/** The note's lines now, or null when it does not show. */
export function satelliteCardLines(on: boolean): { line: string; caveat?: string } | null {
  const earth = sim.bodies.earth;
  if (!on || !earth || earth.apparentPos.distanceTo(sim.camera.pos) > CARD_KM) return null;
  const s = satellites.swarm;
  if (s.status === 'idle' || s.status === 'loading') return { line: 'Fetching the orbital elements of every active satellite from CelesTrak…' };
  if (s.status === 'error') return { line: 'The satellites could not be shown.', caveat: s.message ?? undefined };
  const debris = s.debrisCount ? ` and ${s.debrisCount.toLocaleString('en-US')} pieces of tracked debris` : '';
  const line = `${s.count.toLocaleString('en-US')} active satellites${debris}, from orbital elements of about ${dateOf(s.epochJd)}${s.stale ? ' (an older copy: CelesTrak could not send a newer one)' : ''}.`;
  if (s.shown === 0) {
    return {
      line,
      caveat: `Hidden at this date: SGP4 can place a satellite only within weeks of its elements, so the swarm shows within ${SHOWN_DAYS} days of them.`,
    };
  }
  return { line, caveat: s.shown < 1 && Math.abs(sim.astroTime.ut + 2451545 - s.epochJd) > 14 ? 'Fading: this date is more than two weeks from the elements, and the places drift by hundreds of km a day.' : undefined };
}
