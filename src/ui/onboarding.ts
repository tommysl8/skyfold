/**
 * Actions shared by the welcome screen, the tour, the header, the keys and the guide.
 *
 * The physics reference (left dock) opens only when asked for, from the View menu; "Read more"
 * and "Why" (physics hints, the arrival card, the warning band, the flight planner) open Learn.
 * Nothing opens it by itself, and it is not reopened on a reload.
 */
import { useUI, WELCOME_KEY } from '../state/ui';
import { flushStorage } from '../lib/persistStorage';
import { stopSavingPlace } from './resume';

/** Remember that the welcome screen has been seen. */
export function markWelcomed(): void {
  try {
    localStorage.setItem(WELCOME_KEY, '1');
  } catch {
    /* storage unavailable */
  }
}

/** Open the physics reference (left dock) at the section last read. */
export function openReference(): void {
  useUI.setState({ leftOpen: true });
}

/** The "Where to?" search palette. */
export function openSearch(): void {
  useUI.setState({ searchOpen: true, welcomeOpen: false, tourStep: null, journeysOpen: false, keysOpen: false });
}

export function openJourneys(): void {
  useUI.setState({ journeysOpen: true, searchOpen: false, welcomeOpen: false, tourStep: null, keysOpen: false });
}

export function startTour(): void {
  useUI.setState({ welcomeOpen: false, tourStep: 0, journeysOpen: false, searchOpen: false, keysOpen: false });
}
export function showWelcome(): void {
  useUI.setState({ welcomeOpen: true, tourStep: null, journeysOpen: false, searchOpen: false, keysOpen: false });
}

/**
 * Forget everything Skyfold saved in this browser: panel sizes and states, display toggles,
 * collapsed sections, physics notes already shown, the welcome screen, the place last seen and
 * the saved places.
 */
export function resetPreferences(): void {
  flushStorage(); // so no pending write lands after the keys are removed
  stopSavingPlace(); // nor the view's last save as the page goes
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('lightspeed.')) localStorage.removeItem(k);
    }
  } catch {
    /* storage unavailable */
  }
  window.location.hash = '';
  window.location.reload();
}
