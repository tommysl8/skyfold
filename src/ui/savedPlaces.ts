/**
 * Saved places: views the visitor names and keeps (the header's Saved places menu, ui/layout/SavedPlaces.tsx), in
 * localStorage (`lightspeed.places`, newest first, at most 50; state/place.ts). Each is a place's query, so it goes
 * back exactly where it was and its link is the same as a shared one. Another tab's changes are taken in (the storage
 * event). Reset layout and preferences clears them with the rest of the `lightspeed.` keys.
 */
import { useSyncExternalStore } from 'react';
import { addSaved, cleanLabel, decodePlace, encodePlace, parseSavedPlaces, removeSaved, renameSaved, type SavedPlace } from '../state/place';
import { applyPlace, capturePlace, defaultLabel, placeName, sharePlace } from './places';

export const SAVED_PLACES_KEY = 'lightspeed.places';

function read(): SavedPlace[] {
  try {
    const v = localStorage.getItem(SAVED_PLACES_KEY);
    return v === null ? [] : parseSavedPlaces(JSON.parse(v));
  } catch {
    return [];
  }
}

let list: SavedPlace[] | null = null;
const listeners = new Set<() => void>();

const current = (): SavedPlace[] => (list ??= read());

function set(next: SavedPlace[]): void {
  list = next;
  try {
    localStorage.setItem(SAVED_PLACES_KEY, JSON.stringify(next));
  } catch {
    /* storage full or unavailable: kept for this visit */
  }
  listeners.forEach((f) => f());
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== SAVED_PLACES_KEY && e.key !== null) return;
    list = read();
    listeners.forEach((f) => f());
  });
}

export const useSavedPlaces = (): SavedPlace[] =>
  useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    current,
  );

/** The name a view would be saved under now: "Betelgeuse · 3 Mar 2031" (empty when there is no view to save). */
export function suggestedLabel(): string {
  const p = capturePlace();
  return p ? defaultLabel(p) : '';
}

/** Save the view now under a name (the suggested one when left empty); false when there is no view to save. */
export function saveView(label: string): boolean {
  const p = capturePlace();
  if (!p) return false;
  const name = placeName(p.at);
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  set(addSaved(current(), { id, q: encodePlace(p), name, savedAt: Date.now(), label: cleanLabel(label, defaultLabel(p, name)) }));
  return true;
}

export const renamePlace = (id: string, label: string): void => set(renameSaved(current(), id, label));
export const deletePlace = (id: string): void => set(removeSaved(current(), id));

/** Go to a saved place (with the usual slew where the body is in: it is a move within the visit). */
export function goToSaved(s: SavedPlace): boolean {
  const p = decodePlace(s.q);
  return !!p && applyPlace(p, { smooth: true });
}

/** Pass a saved place on as a link. */
export function shareSaved(s: SavedPlace): ReturnType<typeof sharePlace> {
  const p = decodePlace(s.q);
  return p ? sharePlace(p, s.name) : Promise.resolve('failed');
}
