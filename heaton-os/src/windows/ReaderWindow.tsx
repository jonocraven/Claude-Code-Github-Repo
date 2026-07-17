import { useEffect, useRef, useState } from "react";
import {
  fetchBacklinks,
  fetchFile,
  formatDate,
  postAction,
  saveFile,
  type Backlink,
  type FileResponse,
} from "../api";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { useLive } from "../store/live";
import { openFile, useTabs } from "../store/tabs";

export function ReaderWindow({
  windowId,
  path,
}: {
  windowId: string;
  path: string | undefined;
}) {
  const setTitle = useTabs((s) => s.setTitle);
  const [doc, setDoc] = useState<FileResponse | null>(null);
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [showBacklinks, setShowBacklinks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Editing state (brief §6): explicit save, dirty indicator, conflict warning.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<
    { kind: "idle" | "saving" | "saved" } | { kind: "conflict" | "error"; message: string }
  >({ kind: "idle" });
  const baseModified = useRef<string>("");
  const liveSeq = useLive((s) => s.seq);
  const liveChanged = useLive((s) => s.changed);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    fetchFile(path)
      .then((d) => {
        if (cancelled) return;
        setDoc(d);
        baseModified.current = d.modified;
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

  // Live-update: if this document changed on disk (brief §2.2), refresh it —
  // unless we're editing, where the save-time conflict guard protects the draft.
  useEffect(() => {
    if (!path || editing || liveSeq === 0) return;
    if (!liveChanged.includes(path)) return;
    let cancelled = false;
    fetchFile(path)
      .then((d) => {
        if (cancelled) return;
        setDoc(d);
        baseModified.current = d.modified;
      })
      .catch(() => undefined);
    fetchBacklinks(path)
      .then((b) => !cancelled && setBacklinks(b))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSeq]);

  // Cross-references open the target in a new window (brief §6).
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || editing) return;
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

  const startEditing = () => {
    if (!doc) return;
    setDraft(doc.source ?? "");
    setDirty(false);
    setSaveState({ kind: "idle" });
    setEditing(true);
  };

  const cancelEditing = () => {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return;
    setEditing(false);
    setDirty(false);
  };

  const save = async () => {
    if (!doc || !path) return;
    setSaveState({ kind: "saving" });
    const result = await saveFile(path, draft, baseModified.current);
    if (result.ok && result.modified) {
      baseModified.current = result.modified;
      setDirty(false);
      setSaveState({ kind: "saved" });
      // Re-render the saved markdown so exiting edit shows fresh content.
      const fresh = await fetchFile(path).catch(() => null);
      if (fresh) setDoc(fresh);
    } else if (result.conflict) {
      setSaveState({
        kind: "conflict",
        message:
          result.message ??
          "This file changed on disk since you opened it. Copy your text, reopen, and reapply.",
      });
    } else {
      setSaveState({ kind: "error", message: result.message ?? "Save failed." });
    }
  };

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
          {editing && (
            <span
              className={`reader-savestate reader-savestate-${saveState.kind}`}
              role="status"
            >
              {saveState.kind === "saving"
                ? "Saving…"
                : saveState.kind === "saved"
                  ? "Saved"
                  : dirty
                    ? "Unsaved"
                    : ""}
            </span>
          )}
          {editing ? (
            <>
              <button
                type="button"
                className="reader-tool reader-tool-wide"
                onClick={() => void save()}
                disabled={!dirty || saveState.kind === "saving"}
                title="Save (⌘S)"
              >
                Save
              </button>
              <button
                type="button"
                className="reader-tool reader-tool-wide"
                onClick={cancelEditing}
                title="Stop editing"
              >
                Done
              </button>
            </>
          ) : (
            <>
              {formatDate(doc.modified)}
              <button
                type="button"
                className="reader-tool reader-tool-wide"
                onClick={startEditing}
                title="Edit this document"
              >
                Edit
              </button>
              <button
                type="button"
                className="reader-tool"
                title="Reveal in Finder"
                onClick={() => void postAction("reveal", doc.path)}
              >
                ⌖
              </button>
            </>
          )}
        </span>
      </header>

      {editing && "message" in saveState && (
        <div className={`reader-alert reader-alert-${saveState.kind}`} role="alert">
          {saveState.message}
        </div>
      )}

      {editing ? (
        <MarkdownEditor
          value={draft}
          onChange={(next) => {
            setDraft(next);
            setDirty(true);
            setSaveState((s) => (s.kind === "saved" ? { kind: "idle" } : s));
          }}
          onSave={() => void save()}
        />
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
