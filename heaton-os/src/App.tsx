import { useEffect, useState } from "react";
import { fetchTree, type TreeDir } from "./api";
import { BootScreen } from "./components/BootScreen";
import { Desktop } from "./components/Desktop";

export function App() {
  const [booted, setBooted] = useState(false);
  const [tree, setTree] = useState<TreeDir | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTree()
      .then(setTree)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (!booted) {
    return <BootScreen tree={tree} error={error} onDone={() => setBooted(true)} />;
  }
  return <Desktop tree={tree} error={error} />;
}
