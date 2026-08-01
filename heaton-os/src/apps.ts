export interface AppDef {
  id: string;
  name: string;
  kind: "space" | "system";
  /** CSS custom property holding this app's accent colour. */
  accentVar: string;
  /** Which phase delivers the real app — placeholder window until then. */
  arrivesInPhase?: number;
}

export const APPS: AppDef[] = [
  // The cross-space triage surface — sits above the spaces, not among them.
  { id: "today", name: "Today", kind: "system", accentVar: "--accent-home" },

  // The eight space apps (brief §5)
  { id: "cookery-books", name: "Cookery Books", kind: "space", accentVar: "--accent-cookery-books" },
  { id: "wfdinner", name: "WFDinner", kind: "space", accentVar: "--accent-wfdinner" },
  { id: "home", name: "Home", kind: "space", accentVar: "--accent-home" },
  { id: "house-move", name: "House Move", kind: "space", accentVar: "--accent-house-move" },
  { id: "job-search", name: "Job Search", kind: "space", accentVar: "--accent-job-search" },
  { id: "finances", name: "Finances", kind: "space", accentVar: "--accent-finances" },
  { id: "side-hustle", name: "Side Hustle", kind: "space", accentVar: "--accent-side-hustle" },
  { id: "life-plan", name: "Life Plan", kind: "space", accentVar: "--accent-life-plan" },

  // System apps (brief §4)
  { id: "files", name: "Files", kind: "system", accentVar: "--accent-system" },
  { id: "reader", name: "Reader", kind: "system", accentVar: "--accent-system" },
  { id: "search", name: "Search", kind: "system", accentVar: "--accent-system" },
  { id: "tasks", name: "Tasks", kind: "system", accentVar: "--accent-system" },
  // Timeline replaces Activity and Calendar — they were the same surface split
  // by tense. Both ids still resolve (below) so a saved layout keeps working.
  { id: "timeline", name: "Timeline", kind: "system", accentVar: "--accent-system" },
  { id: "memory", name: "Memory", kind: "system", accentVar: "--accent-system" },
];

export const WELCOME_APP: AppDef = {
  id: "welcome",
  name: "Welcome",
  kind: "system",
  accentVar: "--accent-system",
};

/** Windows without a dock presence (opened via files/refs, not launched). */
const HIDDEN_APPS: AppDef[] = [
  WELCOME_APP,
  { id: "viewer", name: "Viewer", kind: "system", accentVar: "--accent-system" },
  // Retired ids. A tab saved before the merge must still resolve to something
  // rather than throwing on restore; both render the Timeline.
  { id: "activity", name: "Timeline", kind: "system", accentVar: "--accent-system" },
  { id: "calendar", name: "Timeline", kind: "system", accentVar: "--accent-system" },
];

export function getApp(id: string): AppDef {
  const app = APPS.find((a) => a.id === id) ?? HIDDEN_APPS.find((a) => a.id === id);
  if (!app) throw new Error(`Unknown app: ${id}`);
  return app;
}
