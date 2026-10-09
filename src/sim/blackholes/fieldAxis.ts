/**
 * The axis a black hole's field is drawn about (sim/blackholes/holeField.ts HOLE_FIELDS): its spin's direction in world
 * axes, from the flow model's axis (Sgr A*: GRAVITY 2023's flares), its jet as phenomena/jets.ts lays it out (position
 * angle east of north and angle from our line of sight towards us; M87*'s spin points away from us, as the EHT's
 * i = 163° has it), or its disc's normal (the binary's orbit). For scene/HoleFieldLines.tsx and the field's scenes.
 */
import { Vector3 } from 'three';
import { getBody, type BodyId } from '../bodies';
import { eqjToWorld } from '../frames';
import { sim } from '../sim';
import { flowAxisWorld } from './accretion';
import { HOLE_FIELDS } from './holeField';

const POLE = eqjToWorld(0, 0, 1);

/** The hole's field axis (unit, world), or null when it has no field drawn or its axis cannot be found yet. */
export function fieldAxisWorld(id: BodyId, out = new Vector3()): Vector3 | null {
  const spec = HOLE_FIELDS[id];
  if (!spec) return null;
  if (spec.axis === 'flow') return out.set(flowAxisWorld[0], flowAxisWorld[1], flowAxisWorld[2]);
  if (spec.axis === 'disc') {
    const n = getBody(id)?.blackHole?.disk?.normalWorld;
    return n ? out.set(n[0], n[1], n[2]) : null;
  }
  const at = sim.bodies[id];
  const earth = sim.bodies.earth;
  if (!at || !earth || !spec.jet) return null;
  const toEarth = earth.pos.clone().sub(at.pos).normalize();
  const away = toEarth.clone().negate();
  const east = new Vector3().crossVectors(POLE, away).normalize();
  const north = new Vector3().crossVectors(away, east);
  const pa = (spec.jet.paDeg * Math.PI) / 180;
  const th = (spec.jet.thetaDeg * Math.PI) / 180;
  const side = east.multiplyScalar(Math.sin(pa)).addScaledVector(north, Math.cos(pa));
  out.copy(toEarth).multiplyScalar(Math.cos(th)).addScaledVector(side, Math.sin(th)).normalize();
  return spec.spinAway ? out.negate() : out;
}
