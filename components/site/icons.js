// Small inline icon set (24x24, stroke based) so no icon package is needed.
const P = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

const PATHS = {
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  pin: <><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  shield: <><path d="M12 3 4 6v6c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>,
  bolt: <path d="M13 3 5 14h6l-1 7 8-11h-6z" />,
  check: <path d="m5 12 5 5 9-10" />,
  book: <><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5M9 7h6" /></>,
  chart: <><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></>,
  flask: <><path d="M9 3h6M10 3v6L4.5 19a2 2 0 0 0 1.8 3h11.4a2 2 0 0 0 1.8-3L14 9V3" /><path d="M7.5 15h9" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M19 12H5M11 6l-6 6 6 6" />,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></>,
  card: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h4" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
};

export function Ico({ name, size = 22, className }) {
  if (name === 'whatsapp') {
    return (
      <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="currentColor" aria-hidden="true">
        <path d="M12.03 2.5a9.5 9.5 0 0 0-8.22 14.28L2.5 21.5l4.85-1.27A9.5 9.5 0 1 0 12.03 2.5zm0 17.42a7.88 7.88 0 0 1-4.02-1.1l-.29-.17-2.98.78.79-2.9-.19-.3A7.88 7.88 0 1 1 12.03 19.92zm4.33-5.9c-.24-.12-1.4-.69-1.62-.77-.22-.08-.38-.12-.54.12-.16.24-.62.77-.76.93-.14.16-.28.18-.52.06a6.45 6.45 0 0 1-1.9-1.17 7.12 7.12 0 0 1-1.31-1.63c-.14-.24-.01-.37.11-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.46-.4-.4-.54-.4h-.46c-.16 0-.42.06-.64.3A1.95 1.95 0 0 0 6.6 9.38c0 .82.35 1.62 1 2.48 1.48 2 3.75 3.32 6.06 4.14.77.27 1.36.23 1.86.14.56-.1 1.4-.57 1.6-1.13.2-.56.2-1.04.14-1.13-.06-.1-.22-.16-.46-.28z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} aria-hidden="true" {...P}>
      {PATHS[name]}
    </svg>
  );
}

// Decorative benzene ring + lattice used in hero bands.
export function RingArt({ className }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
      <path d="M100 18l71 41v82l-71 41-71-41V59z" strokeWidth="3" />
      <path d="M100 48l45 26v52l-45 26-45-26V74z" strokeWidth="2" strokeDasharray="2 7" />
      <circle cx="100" cy="100" r="22" strokeWidth="3" />
      <circle cx="100" cy="18" r="6" fill="currentColor" stroke="none" />
      <circle cx="171" cy="59" r="6" fill="currentColor" stroke="none" opacity=".6" />
      <circle cx="29" cy="141" r="6" fill="currentColor" stroke="none" opacity=".6" />
    </svg>
  );
}
