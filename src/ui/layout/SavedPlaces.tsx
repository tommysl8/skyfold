/**
 * The header's Saved places menu (ui/savedPlaces.ts): save the view under a name (the body and the date, editable),
 * copy a link to it, and the places saved, newest first: each goes there, and can be renamed, deleted or passed on as
 * a link. Kept in this browser only; a link carries the view and the clock, nothing else.
 */
import { useId, useState } from 'react';
import { useUI } from '../../state/ui';
import { dateLabel, decodePlace, type SavedPlace } from '../../state/place';
import { capturePlace, placeUrl, sharePlace } from '../places';
import { deletePlace, goToSaved, renamePlace, saveView, shareSaved, suggestedLabel, useSavedPlaces } from '../savedPlaces';
import { Menu, MenuHeading } from '../kit';
import { Icon } from '../icons';

type Shared = { what: string; result: 'copied' | 'shared' | 'cancelled' | 'failed'; url?: string } | null;

/** "Betelgeuse · 3 Mar 2031": what a saved place is, under a name the visitor gave it. */
function subline(s: SavedPlace): string {
  const p = decodePlace(s.q);
  if (!p) return s.name;
  return `${s.name} · ${p.t === 'now' ? 'now' : dateLabel(p.t)}`;
}

function Row({ s, close, shared, onShare }: { s: SavedPlace; close: () => void; shared: Shared; onShare: (s: SavedPlace) => void }) {
  const [editing, setEditing] = useState(false);
  const flying = useUI((u) => u.tripActive);
  const sub = subline(s);
  const copied = shared?.what === s.id && shared.result === 'copied';
  const commit = (v: string) => {
    renamePlace(s.id, v);
    setEditing(false);
  };
  return (
    <li className="flex items-center gap-0.5 pl-1 pr-1">
      {editing ? (
        <input
          className="fld h-7 min-w-0 flex-1"
          defaultValue={s.label}
          aria-label={`New name for ${s.label}`}
          maxLength={80}
          autoFocus
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit(e.currentTarget.value);
          }}
          onBlur={(e) => commit(e.currentTarget.value)}
        />
      ) : (
        <button
          className="btn btn-q !h-auto min-w-0 flex-1 !justify-start !px-1.5 py-1 text-left"
          disabled={flying}
          title={flying ? 'Not in flight: finish or abort the trip first' : `Go to ${s.label}`}
          onClick={() => {
            close();
            goToSaved(s);
          }}
        >
          <span className="min-w-0">
            <span className="block truncate text-[12.5px] text-fg">{s.label}</span>
            {sub !== s.label && <span className="mono block truncate text-[10.5px] leading-[15px] text-fg-3">{sub}</span>}
          </span>
        </button>
      )}
      <button className="btn btn-q btn-sq shrink-0" onClick={() => onShare(s)} aria-label={`Copy a link to ${s.label}`} title={copied ? 'Link copied' : 'Copy a link to this place'}>
        <Icon name={copied ? 'check' : 'link'} className={copied ? 'text-data' : ''} />
      </button>
      <button className="btn btn-q btn-sq shrink-0" onClick={() => setEditing(true)} aria-label={`Rename ${s.label}`} title="Rename">
        <Icon name="pencil" />
      </button>
      <button className="btn btn-q btn-sq shrink-0" onClick={() => deletePlace(s.id)} aria-label={`Delete ${s.label}`} title="Delete">
        <Icon name="trash" />
      </button>
    </li>
  );
}

function Panel({ close }: { close: () => void }) {
  const places = useSavedPlaces();
  // The name suggested for the view as it is when the menu opens.
  const [label, setLabel] = useState(suggestedLabel);
  const [shared, setShared] = useState<Shared>(null);
  const [saved, setSaved] = useState(false);
  const inputId = useId();
  const save = () => {
    if (saveView(label)) {
      setSaved(true);
      setLabel(suggestedLabel());
    }
  };
  const report = (what: string, url: string | undefined) => (result: NonNullable<Shared>['result']) => setShared({ what, result, url });
  const copyView = () => {
    const p = capturePlace();
    if (p) void sharePlace(p).then(report('view', placeUrl(p)));
  };
  const share = (s: SavedPlace) => {
    const p = decodePlace(s.q);
    void shareSaved(s).then(report(s.id, p ? placeUrl(p) : undefined));
  };
  const viewCopied = shared?.what === 'view' && shared.result === 'copied';
  return (
    <>
      <div className="px-2.5 pb-2 pt-1.5">
        <label className="cap mb-1.5 block" htmlFor={inputId}>
          Save this view
        </label>
        <div className="flex gap-1.5">
          <input
            id={inputId}
            className="fld min-w-0 flex-1"
            value={label}
            maxLength={80}
            spellCheck={false}
            onChange={(e) => {
              setLabel(e.target.value);
              setSaved(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
          />
          <button className="btn btn-pri btn-sm shrink-0" onClick={save}>
            Save
          </button>
        </div>
        <p className="mt-1 text-[11px] leading-snug text-fg-3" aria-live="polite">
          {saved ? 'Saved: it is first in the list below.' : 'The camera, the date and the pace of time.'}
        </p>
      </div>
      <div className="border-t border-line px-1 py-1">
        <button className="btn btn-q btn-sm !h-7 w-full !justify-start" onClick={copyView}>
          <Icon name={viewCopied ? 'check' : 'link'} className={viewCopied ? 'text-data' : ''} />
          {viewCopied ? 'Link copied' : 'Copy link to this view'}
        </button>
        <p className="sr-only" aria-live="polite">
          {shared?.result === 'copied' ? 'Link copied' : shared?.result === 'failed' ? 'The link could not be copied' : ''}
        </p>
        {shared?.result === 'failed' && (
          <div className="px-1.5 pb-1 pt-0.5">
            <p className="mb-1 text-[11px] leading-snug text-fg-3">The browser would not copy it: select the link and copy it.</p>
            <input className="fld w-full" readOnly value={shared.url ?? ''} onFocus={(e) => e.target.select()} aria-label="Link" />
          </div>
        )}
      </div>
      <div className="border-t border-line">
        <MenuHeading>Saved places</MenuHeading>
        {places.length ? (
          <ul className="list-none pb-1">
            {places.map((s) => (
              <Row key={s.id} s={s} close={close} shared={shared} onShare={share} />
            ))}
          </ul>
        ) : (
          <p className="px-2.5 pb-2 text-[11.5px] leading-snug text-fg-3">None yet. Saved places stay in this browser.</p>
        )}
      </div>
    </>
  );
}

export function SavedPlacesMenu() {
  return (
    <Menu
      title="Saved places: keep this view, go back to one, or copy a link to it"
      ariaLabel="Saved places"
      width={340}
      chevron={false}
      label={<Icon name="bookmark" size={14} />}
    >
      {(close) => <Panel close={close} />}
    </Menu>
  );
}
