import { useEffect } from "react";
import type { TreeDir } from "../api";
import { getApp, WELCOME_APP } from "../apps";
import { useWindows } from "../store/windows";
import { Dock } from "./Dock";
import { MenuBar } from "./MenuBar";
import { WindowFrame } from "./WindowFrame";
import { PlaceholderWindow } from "../windows/PlaceholderWindow";
import { TreeWindow } from "../windows/TreeWindow";
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

  // First scene: the two Phase-1 windows — Welcome, and the live tree.
  useEffect(() => {
    openApp("files");
    openApp(WELCOME_APP.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.metaKey && !e.ctrlKey) return;
      if (e.key.toLowerCase() === "w") {
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

  return (
    <div className="desktop paper-grain">
      <MenuBar />
      <main className="desktop-windows" aria-label="Windows">
        {windows.map((win) => (
          <WindowFrame key={win.id} win={win}>
            {win.appId === WELCOME_APP.id ? (
              <WelcomeWindow />
            ) : win.appId === "files" ? (
              <TreeWindow tree={tree} error={error} />
            ) : (
              <PlaceholderWindow app={getApp(win.appId)} />
            )}
          </WindowFrame>
        ))}
      </main>
      <Dock />
    </div>
  );
}
