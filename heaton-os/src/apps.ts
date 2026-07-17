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
  // The eight space apps (brief §5)
  { id: "cookery-books", name: "Cookery Books", kind: "space", accentVar: "--accent-cookery-books", arrivesInPhase: 5 },
  { id: "wfdinner", name: "WFDinner", kind: "space", accentVar: "--accent-wfdinner", arrivesInPhase: 5 },
  { id: "home", name: "Home", kind: "space", accentVar: "--accent-home", arrivesInPhase: 5 },
  { id: "house-move", name: "House Move", kind: "space", accentVar: "--accent-house-move", arrivesInPhase: 5 },
  { id: "job-search", name: "Job Search", kind: "space", accentVar: "--accent-job-search", arrivesInPhase: 5 },
  { id: "finances", name: "Finances", kind: "space", accentVar: "--accent-finances", arrivesInPhase: 5 },
  { id: "side-hustle", name: "Side Hustle", kind: "space", accentVar: "--accent-side-hustle", arrivesInPhase: 5 },
  { id: "life-plan", name: "Life Plan", kind: "space", accentVar: "--accent-life-plan", arrivesInPhase: 5 },

  // System apps (brief §4)
  { id: "files", name: "Files", kind: "system", accentVar: "--accent-system" },
  { id: "reader", name: "Reader", kind: "system", accentVar: "--accent-system", arrivesInPhase: 2 },
  { id: "search", name: "Search", kind: "system", accentVar: "--accent-system", arrivesInPhase: 3 },
  { id: "tasks", name: "Tasks", kind: "system", accentVar: "--accent-system", arrivesInPhase: 4 },
  { id: "calendar", name: "Calendar", kind: "system", accentVar: "--accent-system", arrivesInPhase: 4 },
  { id: "memory", name: "Memory", kind: "system", accentVar: "--accent-system", arrivesInPhase: 4 },
  { id: "activity", name: "Activity", kind: "system", accentVar: "--accent-system", arrivesInPhase: 4 },
];

export const WELCOME_APP: AppDef = {
  id: "welcome",
  name: "Welcome",
  kind: "system",
  accentVar: "--accent-system",
};

export function getApp(id: string): AppDef {
  if (id === WELCOME_APP.id) return WELCOME_APP;
  const app = APPS.find((a) => a.id === id);
  if (!app) throw new Error(`Unknown app: ${id}`);
  return app;
}
