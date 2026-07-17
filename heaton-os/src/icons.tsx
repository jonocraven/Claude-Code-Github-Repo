/**
 * Hand-drawn icon set (brief §6/§7). Original SVGs on a consistent 2px
 * stroke, round caps and joins for an inked, letterpress-stamp feel, each
 * shape a touch imperfect rather than geometric-perfect. stroke=currentColor
 * so every app tints its own icon to its accent.
 */

interface IconProps {
  size?: number;
}

function Svg({ size = 26, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ICONS: Record<string, (p: IconProps) => React.JSX.Element> = {
  // --- Spaces (icon ideas from §5) ---
  "cookery-books": (p) => (
    <Svg {...p}>
      {/* stock pot with a rising handle-lid */}
      <path d="M5.4 10.2h13.2l-1 8.2c-.1.8-.7 1.3-1.5 1.3H7.9c-.8 0-1.4-.5-1.5-1.3l-1-8.2Z" />
      <path d="M4 10.2h16" />
      <path d="M9 10c-.3-2 .4-3.6 1.4-4.4M13.4 5.2c.6.7.8 1.7.6 2.8" />
    </Svg>
  ),
  wfdinner: (p) => (
    <Svg {...p}>
      {/* plate with a fork and a question of "what's for dinner?" */}
      <circle cx="10.5" cy="12.5" r="6.4" />
      <circle cx="10.5" cy="12.5" r="2.6" />
      <path d="M19 4.4v5.2M19 12.4v.1" />
    </Svg>
  ),
  home: (p) => (
    <Svg {...p}>
      <path d="M3.8 11.6 12 4.2l8.2 7.4" />
      <path d="M6.2 10.4V19.4c0 .5.4.8.8.8h10c.5 0 .8-.3.8-.8v-9" />
      <path d="M10 20.2v-4.4c0-.5.4-.8.9-.8h2.2c.5 0 .9.3.9.8v4.4" />
    </Svg>
  ),
  "house-move": (p) => (
    <Svg {...p}>
      {/* signpost with two boards pointing opposite ways */}
      <path d="M12 3.4v17.2" />
      <path d="M12 6h6.4l1.8 2.2-1.8 2.2H12" />
      <path d="M12 12.4H5.4L3.6 14.6l1.8 2.2H12" />
    </Svg>
  ),
  "job-search": (p) => (
    <Svg {...p}>
      <path d="M4.4 8.6h15.2c.5 0 .8.4.8.9v9c0 .5-.3.9-.8.9H4.4c-.5 0-.8-.4-.8-.9v-9c0-.5.3-.9.8-.9Z" />
      <path d="M9 8.6V6.4c0-.6.4-1 1-1h4c.6 0 1 .4 1 1v2.2" />
      <path d="M3.8 13.2c2.6 1.3 5.4 2 8.2 2s5.6-.7 8.2-2" />
    </Svg>
  ),
  finances: (p) => (
    <Svg {...p}>
      {/* ledger book with lines and a coin */}
      <path d="M6 4.2h11.4c.5 0 .8.4.8.9v13.8c0 .5-.3.9-.8.9H6c-.9 0-1.6-.7-1.6-1.6V5.8C4.4 4.9 5.1 4.2 6 4.2Z" />
      <path d="M8.4 8.4h6.6M8.4 11.4h6.6M8.4 14.4h3.4" />
    </Svg>
  ),
  "side-hustle": (p) => (
    <Svg {...p}>
      {/* price tag */}
      <path d="M12.6 4.2h6.2c.6 0 1 .4 1 1v6.2c0 .3-.1.5-.3.7l-7.6 7.6c-.4.4-1 .4-1.4 0l-6.2-6.2c-.4-.4-.4-1 0-1.4l7.6-7.6c.2-.2.4-.3.7-.3Z" />
      <circle cx="15.7" cy="8.3" r="1.3" />
    </Svg>
  ),
  "life-plan": (p) => (
    <Svg {...p}>
      {/* compass */}
      <circle cx="12" cy="12" r="8.2" />
      <path d="m15.2 8.8-1.7 4.9-4.7 1.6 1.7-4.9 4.7-1.6Z" />
    </Svg>
  ),

  // --- System apps ---
  files: (p) => (
    <Svg {...p}>
      <path d="M3.6 6.4h5.6l2 2.4h9.2c.5 0 .8.4.8.9v9.1c0 .5-.3.8-.8.8H3.6c-.5 0-.8-.3-.8-.8V7.2c0-.5.3-.8.8-.8Z" />
    </Svg>
  ),
  reader: (p) => (
    <Svg {...p}>
      <path d="M12 6.4C10.1 5.1 7.5 4.4 4 4.4v13.4c3.5 0 6.1.7 8 2 1.9-1.3 4.5-2 8-2V4.4c-3.5 0-6.1.7-8 2Z" />
      <path d="M12 6.4v13.4" />
    </Svg>
  ),
  search: (p) => (
    <Svg {...p}>
      <circle cx="10.6" cy="10.6" r="6" />
      <path d="m15.2 15.2 4.4 4.4" />
    </Svg>
  ),
  tasks: (p) => (
    <Svg {...p}>
      <path d="M5 4.4h14c.4 0 .6.3.6.7v13.8c0 .4-.2.7-.6.7H5c-.4 0-.6-.3-.6-.7V5.1c0-.4.2-.7.6-.7Z" />
      <path d="m7.8 11.6 2.6 2.6 5-6" />
    </Svg>
  ),
  calendar: (p) => (
    <Svg {...p}>
      <path d="M4.6 6.4h14.8c.4 0 .6.3.6.7v11.6c0 .4-.2.7-.6.7H4.6c-.4 0-.6-.3-.6-.7V7.1c0-.4.2-.7.6-.7Z" />
      <path d="M4 10.6h16M8.6 4v4M15.4 4v4" />
    </Svg>
  ),
  memory: (p) => (
    <Svg {...p}>
      {/* gauge / dial */}
      <path d="M4 17.4a8 8 0 0 1 16 0" />
      <path d="M4 17.4h16" />
      <path d="m12 17-.2-5" />
      <circle cx="12" cy="17.4" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  ),
  activity: (p) => (
    <Svg {...p}>
      <path d="M3 13.2h3.4l2-6.4 3.6 11 2.4-7.4 1.6 3.4H21" />
    </Svg>
  ),
  welcome: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.2" />
      <path d="M8.6 10.4c1.2-2.4 3.4-2.6 4.8-1.6 1.4 1 1 3-.6 3.6-1 .4-1.4 1-1.4 2" />
      <circle cx="11.4" cy="16.8" r="0.7" fill="currentColor" stroke="none" />
    </Svg>
  ),
};

export function AppIcon({ appId, size }: { appId: string; size?: number }) {
  const Icon = ICONS[appId] ?? ICONS.files!;
  return <Icon size={size} />;
}
