/**
 * Over the bottom of the view, out of the way: the offer to pick up where you left off (ui/resume.ts), and while a
 * place is being gone to, a quiet note on what it waits for ("Loading the star catalogue…") or why it could not be
 * reached (ui/places.ts). Neither blocks anything: the view works around them, and the offer goes by itself once the
 * visitor starts something else.
 */
import { useUI } from '../../state/ui';
import { decodePlace, dateLabel } from '../../state/place';
import { cancelPlace, dismissPlaceNote, placeName, usePlaceNote } from '../places';
import { resume, startFresh, useResumeOffer } from '../resume';
import { CloseIcon } from '../kit';

function Offer({ name, when }: { name: string; when: string }) {
  return (
    <div
      data-place-prompt
      className="panel-float appear pointer-events-auto flex max-w-[560px] flex-wrap items-center justify-end gap-x-4 gap-y-2 py-2 pl-3.5 pr-2"
      role="region"
      aria-label="Pick up where you left off"
    >
      <span className="mr-auto min-w-0 text-[12.5px] leading-snug text-fg-2">
        Pick up where you left off?{' '}
        <span className="whitespace-nowrap font-serif text-[13.5px] text-fg">
          {name} · {when}
        </span>
      </span>
      <span className="flex shrink-0 gap-1.5">
        <button className="btn btn-pri btn-sm" onClick={resume}>
          Resume
        </button>
        <button className="btn btn-q btn-sm" onClick={startFresh}>
          Start fresh
        </button>
      </span>
    </div>
  );
}

export function PlacePrompt() {
  const offer = useResumeOffer();
  const note = usePlaceNote();
  // Not over a dialog (the tour, Where to?, the journeys).
  const covered = useUI((s) => s.welcomeOpen || s.tourStep !== null || s.searchOpen || s.journeysOpen || s.keysOpen);
  const p = offer ? decodePlace(offer.q) : null;
  if (covered || (!p && !note)) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-10 z-20 flex justify-center px-4">
      {p ? (
        <Offer name={offer!.name || placeName(p.at)} when={p.t === 'now' ? 'now' : dateLabel(p.t, true)} />
      ) : (
        <div className="panel-float appear pointer-events-auto flex max-w-[560px] items-start gap-3 py-2 pl-3.5 pr-1.5" role="status">
          <span className={`text-[12.5px] leading-snug ${note!.kind === 'failed' ? 'text-fg-2' : 'text-fg-3'}`}>{note!.text}</span>
          {/* While waiting, closing the note stops going there; after a failure it only puts the note away. */}
          <button
            className="btn btn-q btn-sq -my-0.5 shrink-0"
            onClick={note!.kind === 'loading' ? cancelPlace : dismissPlaceNote}
            aria-label={note!.kind === 'loading' ? 'Stop going there' : 'Dismiss'}
            title={note!.kind === 'loading' ? 'Stop going there' : undefined}
          >
            <CloseIcon />
          </button>
        </div>
      )}
    </div>
  );
}
