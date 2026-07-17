import { useEffect, useState } from "react";
import { fetchTree, type TreeDir } from "./api";
import { BootScreen } from "./components/BootScreen";
import { Desktop } from "./components/Desktop";
import { startLive, useLive } from "./store/live";

export function App() {
  const [booted, setBooted] = useState(false);
  const [tree, setTree] = useState<TreeDir | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seq = useLive((s) => s.seq);

  useEffect(() => {
    startLive();
  }, []);

  // Refetch the tree on boot and whenever the workspace changes on disk,
  // so Files (and every recent/space view derived from the tree) live-update.
  useEffect(() => {
    fetchTree()
      .then((t) => {
        setTree(t);
        setError(null);
      })
      .catch((err: Error) => setError(err.message));
  }, [seq]);

  if (!booted) {
    return <BootScreen tree={tree} error={error} onDone={() => setBooted(true)} />;
  }
  return <Desktop tree={tree} error={error} />;
}
