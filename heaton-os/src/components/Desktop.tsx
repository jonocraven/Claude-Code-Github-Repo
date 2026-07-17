import { useEffect, useState } from "react";
import type { TreeDir } from "../api";
import { getApp, WELCOME_APP } from "../apps";
import { useWindows } from "../store/windows";
import { Dock } from "./Dock";
import { MenuBar } from "./MenuBar";
import { SearchPalette } from "./SearchPalette";
import { WindowFrame } from "./WindowFrame";
import { FilesWindow } from "../windows/FilesWindow";
import { PlaceholderWindow } from "../windows/PlaceholderWindow";
import { ReaderWindow } from "../windows/ReaderWindow";
import { ViewerWindow } from "../windows/ViewerWindow";
import { WelcomeWindow } from "../windows/WelcomeWindow";

export function Desktop({
  tree,
  error,
}: {
  tree: TreeDir | null;
  error: string | null;
}) {
  const windows = useWindows((s) => s.windows);
  const openApp = useWindows((s) => s.openApp);
  const close = useWindows((s) => s.close);
  const cycle = useWindows((s) => s.cycle);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // First scene: Welcome and the live Files window.
  useEffect(() => {
    openApp("files");
    openApp(WELCOME_APP.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      const key = e.key.toLowerCase();
      if (key === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if (key === "w") {
        const { focusedId } = useWindows.getState();
        if (focusedId) {
          e.preventDefault();
          close(focusedId);
        }
      } else if (e.key === "`") {
        e.preventDefault();
        cycle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, cycle]);

  const content = (win: (typeof windows)[number]) => {
    switch (win.appId) {
      case WELCOME_APP.id:
        return <WelcomeWindow />;
      case "files":
        return <FilesWindow tree={tree} error={error} />;
      case "reader":
        return <ReaderWindow windowId={win.id} path={win.payload.path} />;
      case "viewer":
        return <ViewerWindow path={win.payload.path} kind={win.payload.kind} />;
      default:
        return <PlaceholderWindow app={getApp(win.appId)} />;
    }
  };

  return (
    <div className="desktop paper-grain">
      <MenuBar onSearch={() => setPaletteOpen(true)} />
      <main className="desktop-windows" aria-label="Windows">
        {windows.map((win) => (
          <WindowFrame key={win.id} win={win}>
            {content(win)}
          </WindowFrame>
        ))}
      </main>
      <Dock onSearch={() => setPaletteOpen(true)} />
      {paletteOpen && <SearchPalette onClose={() => setPaletteOpen(false)} />}
    </div>
  );
}
