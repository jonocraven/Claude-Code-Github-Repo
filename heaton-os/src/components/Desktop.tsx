import { useEffect, useState } from "react";
import type { TreeDir } from "../api";
import { useTabs } from "../store/tabs";
import { ContentArea } from "./ContentArea";
import { KeymapOverlay } from "./KeymapOverlay";
import { SearchPalette } from "./SearchPalette";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function Desktop({
  tree,
  error,
}: {
  tree: TreeDir | null;
  error: string | null;
}) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [keymapOpen, setKeymapOpen] = useState(false);

  // First run (no restored tabs): open Welcome alongside Files.
  useEffect(() => {
    const { tabs, openApp, openTab } = useTabs.getState();
    if (tabs.length === 0) {
      openApp("files");
      openTab({ appId: "welcome", title: "Welcome" });
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setKeymapOpen(false);
        return;
      }
      if (!e.metaKey && !e.ctrlKey) return;
      const key = e.key.toLowerCase();
      const store = useTabs.getState();
      if (key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (key === "/") {
        e.preventDefault();
        setKeymapOpen((o) => !o);
      } else if (key === "\\") {
        e.preventDefault();
        store.toggleSplit();
      } else if (key === "w") {
        const activeId = store.activePane === "right" ? store.activeRight : store.activeLeft;
        if (activeId) {
          e.preventDefault();
          store.closeTab(activeId);
        }
      } else if (e.key === "`") {
        e.preventDefault();
        store.cycle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="shell">
      <Sidebar onSearch={() => setPaletteOpen(true)} />
      <div className="main paper-grain">
        <TopBar onSearch={() => setPaletteOpen(true)} />
        <ContentArea tree={tree} error={error} />
      </div>
      {paletteOpen && <SearchPalette onClose={() => setPaletteOpen(false)} />}
      {keymapOpen && <KeymapOverlay onClose={() => setKeymapOpen(false)} />}
    </div>
  );
}
