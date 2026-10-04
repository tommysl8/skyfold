/**
 * The cosmos worker: builds the galaxies' particle templates and the cosmology's emission table,
 * and fetches, inflates, decodes and places the cosmic web, off the main thread. The arrays go
 * back without copying.
 */
import { buildSkyTable, buildTemplates, buildWeb, skyTransfer, templateTransfer, webTransfer, type CosmosWorkerReply, type CosmosWorkerRequest } from './cosmosData';

interface WorkerScope {
  onmessage: ((e: MessageEvent<CosmosWorkerRequest>) => void) | null;
  postMessage(message: CosmosWorkerReply, transfer?: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;

scope.onmessage = (e) => {
  const req = e.data;
  void (async () => {
    try {
      if (req.kind === 'templates') {
        const templates = buildTemplates(!!req.fine);
        scope.postMessage({ id: req.id, ok: true, kind: 'templates', templates }, templateTransfer(templates));
      } else if (req.kind === 'sky') {
        const sky = buildSkyTable();
        scope.postMessage({ id: req.id, ok: true, kind: 'sky', sky }, skyTransfer(sky));
      } else {
        const web = await buildWeb(req.url, req.skip, req.bound);
        scope.postMessage({ id: req.id, ok: true, kind: 'web', web }, webTransfer(web));
      }
    } catch (err) {
      scope.postMessage({ id: req.id, ok: false, error: String(err) });
    }
  })();
};
