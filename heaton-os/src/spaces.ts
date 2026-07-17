/**
 * Per-space configuration for the Phase 5 space apps (brief §5). Each space
 * shares the dashboard skeleton (MEMORY hero, section tasks, recent files)
 * and layers on bespoke panels. Folder paths follow the real workspace;
 * panels degrade to a quiet empty state when a file or folder is absent.
 */

export type Panel =
  | { kind: "files"; title: string; folder: string; exts?: string[]; hide?: string[] }
  | { kind: "csv"; title: string; path: string }
  | { kind: "artwork"; title: string; folder: string }
  | { kind: "cv-lanes"; title: string; base: string }
  | { kind: "link"; title: string; url: string; label: string }
  | { kind: "finance-refresh"; title: string };

export interface SpaceConfig {
  id: string;
  name: string;
  folder: string; // Spaces/<name>
  accentVar: string;
  /** A quiet line under the space title (e.g. Life-Plan's quarantine note). */
  headerNote?: string;
  panels: Panel[];
}

export const SPACE_CONFIG: Record<string, SpaceConfig> = {
  "job-search": {
    id: "job-search",
    name: "Job Search",
    folder: "Spaces/Job-Search",
    accentVar: "--accent-job-search",
    panels: [
      { kind: "cv-lanes", title: "CVs", base: "Spaces/Job-Search/Resources/cv" },
      {
        kind: "files",
        title: "Digests",
        folder: "Spaces/Job-Search/Resources/digests",
        exts: ["md"],
        hide: ["State (machine memory — ignore)"],
      },
      {
        kind: "files",
        title: "Applications & notes",
        folder: "Spaces/Job-Search/Resources",
        exts: ["md"],
      },
    ],
  },
  "side-hustle": {
    id: "side-hustle",
    name: "Side Hustle",
    folder: "Spaces/Side-Hustle",
    accentVar: "--accent-side-hustle",
    panels: [
      {
        kind: "artwork",
        title: "Shop artwork",
        folder: "Spaces/Side-Hustle/Shop/Listings/Artwork",
      },
      {
        kind: "files",
        title: "Shop listings",
        folder: "Spaces/Side-Hustle/Shop/Listings",
        exts: ["md"],
      },
      { kind: "files", title: "Planning", folder: "Spaces/Side-Hustle", exts: ["md"] },
    ],
  },
  home: {
    id: "home",
    name: "Home",
    folder: "Spaces/Home",
    accentVar: "--accent-home",
    panels: [
      { kind: "files", title: "Lily's room", folder: "Spaces/Home/Lily-Room", exts: ["md"] },
      { kind: "files", title: "House jobs & notes", folder: "Spaces/Home", exts: ["md"] },
    ],
  },
  "cookery-books": {
    id: "cookery-books",
    name: "Cookery Books",
    folder: "Spaces/Cookery-Books",
    accentVar: "--accent-cookery-books",
    panels: [
      {
        kind: "csv",
        title: "Recipe library",
        path: "Spaces/Cookery-Books/Resources/eyb_master_recipes.csv",
      },
      { kind: "files", title: "Weekly plans", folder: "Spaces/Cookery-Books/Plans", exts: ["md"] },
    ],
  },
  "house-move": {
    id: "house-move",
    name: "House Move",
    folder: "Spaces/House-Move",
    accentVar: "--accent-house-move",
    panels: [
      { kind: "files", title: "Research", folder: "Spaces/House-Move/Resources", exts: ["md"] },
    ],
  },
  finances: {
    id: "finances",
    name: "Finances",
    folder: "Spaces/Finances",
    accentVar: "--accent-finances",
    panels: [
      { kind: "finance-refresh", title: "Next refresh" },
      { kind: "files", title: "Workbooks & refreshes", folder: "Spaces/Finances/Resources", exts: ["md", "xlsx", "csv"] },
    ],
  },
  "life-plan": {
    id: "life-plan",
    name: "Life Plan",
    folder: "Spaces/Life-Plan",
    accentVar: "--accent-life-plan",
    headerNote: "Quarantined from the monthly strategic review.",
    panels: [
      { kind: "files", title: "Scenarios", folder: "Spaces/Life-Plan/Resources/scenarios", exts: ["md"] },
    ],
  },
  wfdinner: {
    id: "wfdinner",
    name: "WFDinner",
    folder: "Spaces/WFDinner",
    accentVar: "--accent-wfdinner",
    headerNote: "The lightest space — a handful of docs.",
    panels: [
      { kind: "link", title: "Live site", url: "https://wfdinner.com", label: "Open wfdinner.com" },
      { kind: "files", title: "Docs", folder: "Spaces/WFDinner", exts: ["md"] },
    ],
  },
};

/** Which space (if any) has a Todoist section — drives the section-tasks panel. */
export const SPACE_HAS_SECTION: Record<string, boolean> = {
  "job-search": true,
  "side-hustle": true,
  home: true,
  "house-move": true,
  finances: true,
  wfdinner: true,
  "cookery-books": false,
  "life-plan": false,
};
