import { useEffect, useMemo, useState } from "react";
import type { TreeDir } from "../api";

interface BootScreenProps {
  tree: TreeDir | null;
  error: string | null;
  onDone: () => void;
}

const LINE_INTERVAL = 260;
const HOLD_AFTER_LAST = 500;

export function BootScreen({ tree, error, onDone }: BootScreenProps) {
  const reducedMotion = useMemo(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  const lines = useMemo(() => {
    const spaces =
      tree?.children.find((n) => n.type === "dir" && n.name === "Spaces") ??
      null;
    const spaceCount =
      spaces && spaces.type === "dir"
        ? spaces.children.filter((c) => c.type === "dir").length
        : "…";
    return [
      "heaton bios v0.1 — letterpress edition",
      "checking paper stock ................. warm cream, OK",
      "inking borders ....................... 2px, OK",
      error
        ? `mounting workspace ................... FAILED (${error})`
        : `mounting workspace ................... ${tree ? `${tree.fileCount} files, OK` : "…"}`,
      `waking ${spaceCount} spaces .................... OK`,
      "starting window manager .............. OK",
    ];
  }, [tree, error]);

  const [shown, setShown] = useState(reducedMotion ? lines.length : 0);

  // Respect prefers-reduced-motion: skip the sequence entirely (brief §3).
  useEffect(() => {
    if (reducedMotion) {
      onDone();
      return;
    }
    const skip = () => onDone();
    window.addEventListener("keydown", skip);
    window.addEventListener("pointerdown", skip);
    return () => {
      window.removeEventListener("keydown", skip);
      window.removeEventListener("pointerdown", skip);
    };
  }, [reducedMotion, onDone]);

  useEffect(() => {
    if (reducedMotion) return;
    if (shown < lines.length) {
      const t = setTimeout(() => setShown((n) => n + 1), LINE_INTERVAL);
      return () => clearTimeout(t);
    }
    const t = setTimeout(onDone, HOLD_AFTER_LAST);
    return () => clearTimeout(t);
  }, [shown, lines.length, reducedMotion, onDone]);

  return (
    <div className="boot paper-grain" role="status" aria-label="Heaton OS is starting">
      <h1 className="boot-wordmark">
        Heaton<span className="boot-wordmark-os">OS</span>
      </h1>
      <div className="boot-lines" aria-hidden="true">
        {lines.slice(0, shown).map((line, i) => (
          <div key={i} className="boot-line">
            {line}
          </div>
        ))}
        {shown < lines.length && <div className="boot-cursor">▮</div>}
      </div>
      <p className="boot-hint">press any key to skip</p>
    </div>
  );
}
