/**
 * Field lines are traced here, off the main thread (sim/fields/lines.ts): a planet's in about half a second, the Sun's
 * in about one. Each answer's arrays are transferred, not copied.
 */
import { harmonics, shCount } from './harmonics';
import { planetLines, sunLines, type LineSet } from './lines';
import { fieldModel } from './models';

export type FieldWorkerRequest =
  | { id: number; kind: 'planet'; body: string; year: number }
  | { id: number; kind: 'sun'; degree: number; coeffs: Float32Array };

export type FieldWorkerReply = { id: number; set: LineSet | null; error?: string };

interface WorkerScope {
  onmessage: ((e: MessageEvent<FieldWorkerRequest>) => void) | null;
  postMessage(message: FieldWorkerReply, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

const transfers = (s: LineSet): Transferable[] => [s.positions.buffer, s.phase.buffer, s.along.buffer, s.starts.buffer, s.polarity.buffer, s.kind.buffer] as Transferable[];

scope.onmessage = (e) => {
  const q = e.data;
  try {
    let set: LineSet | null = null;
    if (q.kind === 'planet') {
      const m = fieldModel(q.body);
      if (m) set = planetLines(m, q.year);
    } else {
      const c = harmonics(q.degree);
      const n = shCount(q.degree);
      c.g.set(q.coeffs.subarray(0, n));
      c.h.set(q.coeffs.subarray(n, 2 * n));
      set = sunLines(c);
    }
    scope.postMessage({ id: q.id, set }, set ? transfers(set) : []);
  } catch (err) {
    scope.postMessage({ id: q.id, set: null, error: String(err) });
  }
};
