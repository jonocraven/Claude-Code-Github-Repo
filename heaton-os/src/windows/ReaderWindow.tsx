import { useEffect, useRef, useState } from "react";
import {
  fetchBacklinks,
  fetchFile,
  formatDate,
  postAction,
  type Backlink,
  type FileResponse,
} from "../api";
import { openFile, useWindows } from "../store/windows";

export function ReaderWindow({
  windowId,
  path,
}: {
  windowId: string;
  path: string | undefined;
}) {
  const setTitle = useWindows((s) => s.setTitle);
  const [doc, setDoc] = useState<FileResponse | null>(null);
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [showBacklinks, setShowBacklinks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    fetchFile(path)
      .then((d) => {
        if (cancelled) return;
        setDoc(d);
        if (d.title) setTitle(windowId, d.title);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    fetchBacklinks(path)
      .then((b) => !cancelled && setBacklinks(b))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [path, windowId, setTitle]);

  // Cross-references open the target in a new window (brief §6).
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement).closest("a[data-ref]");
      if (!anchor) return;
      e.preventDefault();
      const ref = anchor.getAttribute("data-ref");
      if (ref) openFile(ref);
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  });

  if (!path) {
    return (
      <div className="tree-state">
        <p className="tree-state-title">Nothing open</p>
        <p>Open a markdown file from Files or Search and it lands here.</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="tree-state" role="alert">
        <p className="tree-state-title">Couldn't read the file</p>
        <p>{error}</p>
      </div>
    );
  }
  if (!doc) {
    return (
      <div className="tree-state" role="status">
        <p>Setting the type…</p>
      </div>
    );
  }

  return (
    <div className="reader" ref={bodyRef}>
      <header className="reader-meta">
        <span className="reader-path">{doc.path}</span>
        <span className="reader-meta-right">
          {formatDate(doc.modified)}
          <button
            type="button"
            className="reader-tool"
            title="Reveal in Finder"
            onClick={() => void postAction("reveal", doc.path)}
          >
            ⌖
          </button>
        </span>
      </header>

      {doc.frontmatter && doc.frontmatter.length > 0 && (
        <aside className="frontmatter-card" aria-label="Document summary">
          <dl>
            {doc.frontmatter.map((f) => (
              <div key={f.label} className="frontmatter-row">
                <dt>{f.label}</dt>
                <dd dangerouslySetInnerHTML={{ __html: f.html }} />
              </div>
            ))}
          </dl>
        </aside>
      )}

      <article
        className="reader-body"
        dangerouslySetInnerHTML={{ __html: doc.html ?? "" }}
      />

      <footer className="backlinks">
        <button
          type="button"
          className="backlinks-toggle"
          aria-expanded={showBacklinks}
          onClick={() => setShowBacklinks((s) => !s)}
        >
          {showBacklinks ? "▾" : "▸"} Referenced by {backlinks.length}{" "}
          {backlinks.length === 1 ? "document" : "documents"}
        </button>
        {showBacklinks && (
          <ul className="backlinks-list">
            {backlinks.length === 0 && (
              <li className="backlinks-empty">
                Nothing in the workspace links here yet.
              </li>
            )}
            {backlinks.map((b) => (
              <li key={b.source}>
                <button
                  type="button"
                  className="backlink"
                  onClick={() => openFile(b.source)}
                >
                  <span className="backlink-title">{b.sourceTitle}</span>
                  <span className="backlink-snippet">{b.snippet}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </footer>
    </div>
  );
}
