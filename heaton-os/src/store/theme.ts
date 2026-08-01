import { create } from "zustand";

/**
 * Theme preference: "system" follows the OS via prefers-color-scheme; "light"
 * and "dark" are explicit overrides that win over it in both directions.
 * Persists to localStorage so a reload restores the choice. The stored value
 * is also applied synchronously by an inline script in index.html, ahead of
 * this module loading, so there is no flash of the wrong theme on first paint.
 */

export type ThemePreference = "light" | "dark" | "system";

const STORE_KEY = "heaton-os.theme.v1";

function isThemePreference(v: unknown): v is ThemePreference {
  return v === "light" || v === "dark" || v === "system";
}

function load(): ThemePreference {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return isThemePreference(raw) ? raw : "system";
  } catch {
    return "system";
  }
}

function persist(preference: ThemePreference): void {
  try {
    localStorage.setItem(STORE_KEY, preference);
  } catch {
    /* storage unavailable — session just won't restore */
  }
}

/**
 * Stamps data-theme on <html> for an explicit override, or clears it for
 * "system" so the tokens.css `@media (prefers-color-scheme: dark)` block
 * drives the ground truth and live-follows OS changes without a listener.
 * color-scheme is kept in step so native form controls and scrollbars match.
 */
function apply(preference: ThemePreference): void {
  // Store tests run under Node, with no `document` — guard so importing the
  // store there doesn't throw; the DOM effect only matters in the browser.
  if (typeof document === "undefined") return;
  if (preference === "system") {
    delete document.documentElement.dataset.theme;
    document.documentElement.style.colorScheme = "light dark";
  } else {
    document.documentElement.dataset.theme = preference;
    document.documentElement.style.colorScheme = preference;
  }
}

const CYCLE: Record<ThemePreference, ThemePreference> = {
  light: "dark",
  dark: "system",
  system: "light",
};

interface ThemeState {
  preference: ThemePreference;
  cycle: () => void;
}

export const useTheme = create<ThemeState>((set, get) => {
  const preference = load();
  apply(preference);

  return {
    preference,

    cycle: () => {
      const next = CYCLE[get().preference];
      persist(next);
      apply(next);
      set({ preference: next });
    },
  };
});
