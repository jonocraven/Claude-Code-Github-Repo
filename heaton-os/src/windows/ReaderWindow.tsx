import { useEffect, useRef, useState } from "react";
import {
  fetchBacklinks,
  fetchFile,
  formatDate,
  postAction,
  saveFile,
  type Backlink,
  type FileResponse,
  type TreeDir,
  type TreeFile,
} from "../api";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { getReadPos, saveReadPos } from "../store/readpos";
import { useLive } from "../store/live";
import { consumeSkipRestore, openFile, useTabs } from "../store/tabs";
import { filesIn } from "../tree-utils";

/** Sibling markdown files in the same folder, in Files' own A-Z order (brief
 *  03 §4) — filesIn's default sort is by recency, so this re-sorts by name. */
function mdSiblings(tree: TreeDir | null, path: string): TreeFile[] {
  if (!tree) return [];
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  return filesIn(tree, dir, ["md"])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
}

export function ReaderWindow({
  windowId,
  path,
  tree,
}: {
  windowId: string;
  path: string | undefined;
  tree: TreeDir | null;
}) {
  const setTitle = useTabs((s) => s.setTitle);
  const pinTab = useTabs((s) => s.pinTab);
  const retarget = useTabs((s) => s.retarget);
  const [doc, setDoc] = useState<FileResponse | null>(null);
  const [backlinks, setBacklinks] = useState<Backlink[]>([]);
  const [showBacklinks, setShowBacklinks] = useState(false);
  const [outbound, setOutbound] = useState<string[]>([]);
  const [activeHeadingId, setActiveHeadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  // Whether the *current* document identity is allowed to restore a
  // remembered scroll position — false right after a search hit. Set once
  // per document identity, in the fetch effect below, not on every render.
  const restoreOkRef = useRef(true);

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
    // A fresh document identity: pick up (and clear) the flag that says a
    // search hit opened this, so the restore effect below knows to land at
    // the top instead (brief 03 §3).
    restoreOkRef.current = !consumeSkipRestore(windowId);
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
      .then((b) => {
        if (cancelled) return;
        setBacklinks(b);
        // Open by default only when there's something to see (brief 03 §5).
        setShowBacklinks(b.length > 0);
      })
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

  // Reading position: restore after the document's HTML has actually
  // rendered — a requestAnimationFrame after the effect fires is the
  // reliable point, otherwise the container isn't tall enough yet and the
  // restore silently clamps to 0 (brief 03 §3, trap). Keyed on document
  // *identity* (doc?.path), not the `doc` object itself, so this never
  // refights the live-update refetch above, which replaces `doc` without
  // changing its path.
  useEffect(() => {
    if (!doc || editing) return;
    if (!restoreOkRef.current) return;
    const container = bodyRef.current?.closest(".pane-body") as HTMLElement | null;
    if (!container) return;
    const pos = getReadPos(doc.path);
    if (pos == null) return;
    const raf = requestAnimationFrame(() => {
      container.scrollTop = pos;
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.path, editing]);

  // Reading position: save on scroll, throttled to at most once per 250ms
  // (brief 03 §3). Never while editing — the editor isn't the reading view
  // this position describes. `.pane-body` is the scroll container; `.reader`
  // itself is not scrollable.
  useEffect(() => {
    if (!doc || editing) return;
    const container = bodyRef.current?.closest(".pane-body") as HTMLElement | null;
    if (!container) return;
    const docPath = doc.path;
    let lastSave = 0;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      lastSave = Date.now();
      pending = null;
      saveReadPos(docPath, container.scrollTop);
    };
    const onScroll = () => {
      const wait = 250 - (Date.now() - lastSave);
      if (wait <= 0) flush();
      else if (pending == null) pending = setTimeout(flush, wait);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (pending != null) clearTimeout(pending);
    };
  }, [doc?.path, editing]);

  // Contents rail: track which heading is in view. Re-established every time
  // the HTML actually changes, not just when it's re-rendered with the same
  // content — dangerouslySetInnerHTML replaces the DOM wholesale, so a stale
  // observer would be watching detached nodes (brief 03 §2, trap). The root
  // is `.pane-body`, the actual scrolling ancestor — `.reader` does not scroll.
  useEffect(() => {
    if (!doc || editing) return;
    const rail = (doc.headings ?? []).filter((h) => h.depth === 2 || h.depth === 3);
    if (rail.length === 0) return;
    const article = articleRef.current;
    const container = article?.closest(".pane-body") as HTMLElement | null;
    if (!article || !container) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length === 0) return;
        // Nearest the top of the visible set reads as "currently at".
        const top = visible.reduce((a, b) =>
          a.boundingClientRect.top <= b.boundingClientRect.top ? a : b
        );
        setActiveHeadingId(top.target.id);
      },
      { root: container, rootMargin: "0px 0px -70% 0px" }
    );

    // Re-query and re-observe from scratch. Binding once is not enough: a
    // later render re-runs dangerouslySetInnerHTML and swaps every heading
    // for a fresh node, leaving the observer watching detached elements —
    // silently, since a detached target simply never reports again. The
    // MutationObserver below catches exactly that swap.
    const bind = () => {
      observer.disconnect();
      for (const h of rail) {
        const el = article.querySelector<HTMLElement>(`#${CSS.escape(h.id)}`);
        if (el) observer.observe(el);
      }
    };
    bind();

    const swaps = new MutationObserver(bind);
    swaps.observe(article, { childList: true });

    return () => {
      swaps.disconnect();
      observer.disconnect();
    };
  }, [doc?.html, editing]);

  // Outbound refs for the "Links to" list: the resolved data-ref targets
  // actually in the rendered DOM, deduplicated in document order (brief 03
  // §5) — read from the DOM, not a re-parse of the markdown. Recomputed
  // whenever the HTML changes, for the same reason as the rail observer above.
  useEffect(() => {
    if (!doc || editing) {
      setOutbound([]);
      return;
    }
    const article = articleRef.current;
    if (!article) return;
    const seen = new Set<string>();
    const refs: string[] = [];
    for (const a of Array.from(article.querySelectorAll<HTMLElement>("a[data-ref]"))) {
      const ref = a.getAttribute("data-ref");
      if (ref && !seen.has(ref)) {
        seen.add(ref);
        refs.push(ref);
      }
    }
    setOutbound(refs);
  }, [doc?.html, editing]);

  const startEditing = () => {
    if (!doc) return;
    setDraft(doc.source ?? "");
    setDirty(false);
    setSaveState({ kind: "idle" });
    setEditing(true);
    // Editing is a commitment — a preview tab must not be evicted mid-edit.
    pinTab(windowId);
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

  // Next/previous: sibling markdown files in the same folder, reusing this
  // tab rather than opening a new one (brief 03 §4).
  const goToSibling = (file: TreeFile) => {
    retarget(windowId, { instanceKey: file.path, title: file.name, payload: { path: file.path } });
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

  const allHeadings = doc.headings ?? [];
  const railHeadings = allHeadings.filter((h) => h.depth === 2 || h.depth === 3);
  const showRail = allHeadings.length >= 4 && railHeadings.length > 0;
  const siblings = mdSiblings(tree, path);
  const currentIndex = siblings.findIndex((f) => f.path === path);
  const prevFile = currentIndex > 0 ? siblings[currentIndex - 1] : null;
  const nextFile =
    currentIndex !== -1 && currentIndex < siblings.length - 1
      ? siblings[currentIndex + 1]
      : null;

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
          {!editing && (
            <>
              <button
                type="button"
                className="reader-tool"
                title="Previous document in this folder"
                aria-label="Previous document in this folder"
                disabled={!prevFile}
                onClick={() => prevFile && goToSibling(prevFile)}
              >
                ‹
              </button>
              <button
                type="button"
                className="reader-tool"
                title="Next document in this folder"
                aria-label="Next document in this folder"
                disabled={!nextFile}
                onClick={() => nextFile && goToSibling(nextFile)}
              >
                ›
              </button>
            </>
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

          <div className="reader-columns">
            {showRail && (
              <nav className="reader-toc" aria-label="Contents">
                {railHeadings.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    className={`reader-toc-item${h.depth === 3 ? " reader-toc-sub" : ""}${
                      activeHeadingId === h.id ? " is-active" : ""
                    }`}
                    onClick={() => {
                      articleRef.current
                        ?.querySelector<HTMLElement>(`#${CSS.escape(h.id)}`)
                        ?.scrollIntoView({ block: "start" });
                    }}
                  >
                    {h.text}
                  </button>
                ))}
              </nav>
            )}
            <article
              className="reader-body"
              ref={articleRef}
              dangerouslySetInnerHTML={{ __html: doc.html ?? "" }}
            />
          </div>

          <footer className="backlinks">
            <div className="backlinks-groups">
              <div className="backlinks-group">
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
              </div>

              <div className="backlinks-group">
                <p className="backlinks-group-title">
                  Links to {outbound.length > 0 ? outbound.length : ""}
                </p>
                <ul className="backlinks-list">
                  {outbound.length === 0 && (
                    <li className="backlinks-empty">
                      This document has no outbound references.
                    </li>
                  )}
                  {outbound.map((ref) => (
                    <li key={ref}>
                      <button
                        type="button"
                        className="backlink"
                        onClick={() => openFile(ref)}
                      >
                        <span className="backlink-title">{ref.split("/").pop()}</span>
                        <span className="backlink-snippet">{ref}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </footer>
        </>
      )}
    </div>
  );
}
