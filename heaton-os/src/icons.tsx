/**
 * Placeholder icon set — simple geometric SVGs, consistent 2px stroke,
 * stroke=currentColor so each app tints its own icon. The real hand-crafted
 * stamp-like set arrives in Phase 6; these exist so the dock is never emoji.
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
      strokeWidth="2"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ICONS: Record<string, (p: IconProps) => React.JSX.Element> = {
  // Spaces
  "cookery-books": (p) => (
    <Svg {...p}>
      <path d="M5 10h14l-1.5 9h-11L5 10Z" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </Svg>
  ),
  wfdinner: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.5" />
    </Svg>
  ),
  home: (p) => (
    <Svg {...p}>
      <path d="M4 11.5 12 4l8 7.5" />
      <path d="M6.5 10.5V20h11v-9.5" />
      <path d="M10.5 20v-5h3v5" />
    </Svg>
  ),
  "house-move": (p) => (
    <Svg {...p}>
      <path d="M12 3v18" />
      <path d="M12 6h8l-2 3 2 3h-8" />
      <path d="M12 16H5l1.6-2.5L5 11h7" />
    </Svg>
  ),
  "job-search": (p) => (
    <Svg {...p}>
      <rect x="4" y="8" width="16" height="11" />
      <path d="M9 8V5.5h6V8" />
      <path d="M4 13h16" />
    </Svg>
  ),
  finances: (p) => (
    <Svg {...p}>
      <rect x="5" y="4" width="14" height="16" />
      <path d="M9 9h6M9 13h6M9 17h3" />
    </Svg>
  ),
  "side-hustle": (p) => (
    <Svg {...p}>
      <path d="M13 4h6v6L9.5 19.5 4 14 13 4Z" />
      <circle cx="15.5" cy="8" r="1.4" />
    </Svg>
  ),
  "life-plan": (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m14.8 9-1.5 4.5L9 15.2l1.5-4.7L14.8 9Z" />
    </Svg>
  ),

  // System
  files: (p) => (
    <Svg {...p}>
      <path d="M3.5 6h6l2 2.5H20.5V19h-17V6Z" />
    </Svg>
  ),
  reader: (p) => (
    <Svg {...p}>
      <path d="M12 6c-1.8-1.4-4.4-2-8-2v14c3.6 0 6.2.6 8 2 1.8-1.4 4.4-2 8-2V4c-3.6 0-6.2.6-8 2Z" />
      <path d="M12 6v14" />
    </Svg>
  ),
  search: (p) => (
    <Svg {...p}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="m15 15 5 5" />
    </Svg>
  ),
  tasks: (p) => (
    <Svg {...p}>
      <rect x="4" y="4" width="16" height="16" />
      <path d="m8 12 3 3 5.5-6" />
    </Svg>
  ),
  calendar: (p) => (
    <Svg {...p}>
      <rect x="4" y="6" width="16" height="14" />
      <path d="M4 10.5h16M8.5 4v4M15.5 4v4" />
    </Svg>
  ),
  memory: (p) => (
    <Svg {...p}>
      <path d="M4 18a8 8 0 0 1 16 0" />
      <path d="m12 15 4-5" />
      <circle cx="12" cy="16" r="1.4" />
    </Svg>
  ),
  activity: (p) => (
    <Svg {...p}>
      <path d="M3 13h4l2.5-6 4 10 2.5-6H21" />
    </Svg>
  ),
  welcome: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 9.5c.3-1.4 1.3-2.2 2.7-2.2 1.5 0 2.6 1 2.6 2.4 0 1.9-2.8 2.1-2.8 4" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" />
    </Svg>
  ),
};

export function AppIcon({ appId, size }: { appId: string; size?: number }) {
  const Icon = ICONS[appId] ?? ICONS.files!;
  return <Icon size={size} />;
}
