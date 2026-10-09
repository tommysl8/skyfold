/**
 * Line icons drawn on a 12 px grid with 1.2 px strokes, to sit beside 11–12 px text.
 * Decorative: buttons carry their own labels.
 */
import type { ReactNode } from 'react';

type Name =
  | 'dock-left'
  | 'dock-right'
  | 'flight'
  | 'book'
  | 'info'
  | 'tour'
  | 'orbit'
  | 'compass'
  | 'keyboard'
  | 'print'
  | 'arrow-right'
  | 'arrow-left'
  | 'external'
  | 'mail'
  | 'copy'
  | 'check'
  | 'search'
  | 'sliders'
  | 'chevron-left'
  | 'chevron-right'
  | 'chevron-up'
  | 'chevron-down'
  | 'move'
  | 'fullscreen'
  | 'gauge'
  | 'bookmark'
  | 'pencil'
  | 'trash'
  | 'link';

const PATHS: Record<Name, ReactNode> = {
  'dock-left': (
    <>
      <rect x="1.5" y="1.5" width="9" height="9" />
      <path d="M4.5 1.5v9" />
    </>
  ),
  'dock-right': (
    <>
      <rect x="1.5" y="1.5" width="9" height="9" />
      <path d="M7.5 1.5v9" />
    </>
  ),
  // A trajectory arc from a departure point to an arrow head
  flight: (
    <>
      <path d="M1.5 10.5C3 5 6.5 2.5 10.5 1.5" />
      <path d="M7.4 1.2l3.1.3-1.2 2.9" />
      <circle cx="1.8" cy="10.2" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  book: (
    <>
      <path d="M6 3C4.8 2 3.2 1.8 1.5 2v8c1.7-.2 3.3 0 4.5 1 1.2-1 2.8-1.2 4.5-1V2C8.8 1.8 7.2 2 6 3z" />
      <path d="M6 3v8" />
    </>
  ),
  info: (
    <>
      <circle cx="6" cy="6" r="4.8" />
      <path d="M6 5.3v3.2M6 3.4v.1" />
    </>
  ),
  tour: (
    <>
      <circle cx="6" cy="6" r="4.8" />
      <path d="M7.9 4.1L6.9 6.9 4.1 7.9l1-2.8z" />
    </>
  ),
  orbit: (
    <>
      <ellipse cx="6" cy="6" rx="5" ry="2.3" transform="rotate(-24 6 6)" />
      <circle cx="6" cy="6" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  // A compass rose: the needle filled at its north end
  compass: (
    <>
      <circle cx="6" cy="6" r="4.8" />
      <path d="M8.2 3.8L7 7 3.8 8.2 5 5z" fill="currentColor" stroke="none" />
    </>
  ),
  keyboard: (
    <>
      <rect x="1" y="3" width="10" height="6.5" rx="0.6" />
      <path d="M3 5h.1M5 5h.1M7 5h.1M9 5h.1M3.5 7.5h5" />
    </>
  ),
  print: (
    <>
      <path d="M3.5 4.5v-3h5v3M3.5 8.5h-2v-4h9v4h-2" />
      <rect x="3.5" y="7" width="5" height="3.5" />
    </>
  ),
  'arrow-right': <path d="M2 6h8M7 3l3 3-3 3" />,
  'arrow-left': <path d="M10 6H2M5 3L2 6l3 3" />,
  external: <path d="M5 2.5H2.5v7h7V7M7 2.5h2.5V5M9.5 2.5L5.5 6.5" />,
  mail: (
    <>
      <rect x="1.5" y="2.5" width="9" height="7" />
      <path d="M1.5 3l4.5 3.6L10.5 3" />
    </>
  ),
  copy: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" />
      <path d="M1.5 8.5v-7h7" />
    </>
  ),
  check: <path d="M2 6.3l2.6 2.6L10 3.5" />,
  // A magnifying glass
  search: (
    <>
      <circle cx="5.2" cy="5.2" r="3.7" />
      <path d="M8 8l2.6 2.6" />
    </>
  ),
  // Two faders: display options
  sliders: (
    <>
      <path d="M1.5 3.5h1.2M5.3 3.5h5.2M1.5 8.5h5.2M9.3 8.5h1.2" />
      <circle cx="4" cy="3.5" r="1.3" />
      <circle cx="8" cy="8.5" r="1.3" />
    </>
  ),
  'chevron-left': <path d="M7.5 2.5L4 6l3.5 3.5" />,
  'chevron-right': <path d="M4.5 2.5L8 6l-3.5 3.5" />,
  'chevron-up': <path d="M2.5 7.5L6 4l3.5 3.5" />,
  'chevron-down': <path d="M2.5 4.5L6 8l3.5-3.5" />,
  // Four ways out from the middle: Roam
  move: <path d="M6 1.5v9M1.5 6h9M4.6 2.9L6 1.5l1.4 1.4M4.6 9.1L6 10.5l1.4-1.4M2.9 4.6L1.5 6l1.4 1.4M9.1 4.6L10.5 6 9.1 7.4" />,
  // The four corners of the screen: full screen
  fullscreen: <path d="M1.5 4.2V1.5h2.7M7.8 1.5h2.7v2.7M10.5 7.8v2.7H7.8M4.2 10.5H1.5V7.8" />,
  // A dial with its needle: the instrument panel
  gauge: (
    <>
      <path d="M1.8 9.2a4.8 4.8 0 1 1 8.4 0" />
      <path d="M6 7.2l2.3-2.6" />
    </>
  ),
  // A ribbon with a notch: saved places
  bookmark: <path d="M3 1.5h6v9L6 8.2 3 10.5z" />,
  // A pencil: rename
  pencil: <path d="M8 1.8l2.2 2.2-6 6H2V7.8zM6.8 3l2.2 2.2" />,
  // A bin: delete
  trash: <path d="M1.8 3h8.4M4.5 3V1.8h3V3M3 3l.6 7.2h4.8L9 3" />,
  // Two links of a chain: a link to this view
  link: <path d="M5 7l2-2M5.6 3.4l1-1a2 2 0 0 1 2.9 2.9l-1 1M6.4 8.6l-1 1a2 2 0 0 1-2.9-2.9l1-1" />,
};

export function Icon({ name, size = 12, className = '' }: { name: Name; size?: number; className?: string }) {
  return (
    <svg
      className={`shrink-0 ${className}`}
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
