import { useEffect, useMemo, useRef, useState } from "react";
import { fetchSearch, type SearchResponse } from "../api";
import { APPS, type AppDef } from "../apps";
import { AppIcon } from "../icons";
import { openFile, useTabs } from "../store/tabs";

const SPACES = APPS.filter((a) => a.kind === "space");

/** Space ids ↔ workspace folder names (Spaces/<folder>). */
const SPACE_FOLDER: Record<string, string> = {
  "cookery-books": "Cookery-Books",
  wfdinner: "WFDinner",
  home: "Home",
  "house-move": "House-Move",
  "job-search": "Job-Search",
  finances: "Finances",
  "side-hustle": "Side-Hustle",
  "life-plan": "Life-Plan",
};

interface Entry {
  key: string;
  run: () => void;
}

export function SearchPalette({ onClose }: { onClose: () => void }) {
  const openApp = useTabs((s) => s.openApp);
  const [query, setQuery] = useState("");
  const [space, setSpace] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResponse | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => inputRef.current?.focus(), []);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!query.trim()) {
      setResults(null);
      return;
    }
    debounce.current = setTimeout(() => {
      fetchSearch(query, space ? SPACE_FOLDER[space]! : null)
        .then(setResults)
        .catch(() => setResults(null));
    }, 150);
  }, [query, space]);

  // App-launcher behaviour: "job" → Job Search (brief §4.3).
  const appHits: AppDef[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return APPS.filter((a) => a.name.toLowerCase().includes(q)).slice(0, 3);
  }, [query]);

  const entries: Entry[] = useMemo(() => {
    const list: Entry[] = appHits.map((a) => ({
      key: `app:${a.id}`,
      run: () => {
        openApp(a.id);
        onClose();
      },
    }));
    for (const hit of results?.keyword ?? []) {
      list.push({
        key: `kw:${hit.path}`,
        run: () => {
          openFile(hit.path);
          onClose();
        },
      });
    }
    for (const hit of results?.semantic ?? []) {
      list.push({
        key: `sem:${hit.path}`,
        run: () => {
          openFile(hit.path);
          onClose();
        },
      });
    }
    return list;
  }, [appHits, results, openApp, onClose]);

  useEffect(() => setActive(0), [query, space, results?.keyword.length]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, entries.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && entries[active]) {
      entries[active].run();
    }
  };

  let cursor = -1;
  const rowClass = (key: string) => {
    cursor += 1;
    const isActive = cursor === active;
    return { className: `palette-row${isActive ? " is-active" : ""}`, key };
  };

  return (
    <div
      className="palette-overlay"
      role="presentation"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="palette"
        role="dialog"
        aria-label="Search the workspace"
        onKeyDown={onKeyDown}
      >
        <input
          ref={inputRef}
          className="palette-input"
          type="text"
          placeholder="Search documents and apps…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search query"
        />
        <div className="palette-filters" role="group" aria-label="Filter by space">
          <button
            type="button"
            className={`palette-chip${space === null ? " is-active" : ""}`}
            aria-pressed={space === null}
            onClick={() => setSpace(null)}
          >
            All
          </button>
          {SPACES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`palette-chip${space === s.id ? " is-active" : ""}`}
              aria-pressed={space === s.id}
              style={{ "--chip-accent": `var(${s.accentVar})` } as React.CSSProperties}
              onClick={() => setSpace((cur) => (cur === s.id ? null : s.id))}
            >
              {s.name}
            </button>
          ))}
        </div>

        <div className="palette-results">
          {appHits.length > 0 && (
            <section>
              <h3 className="palette-section">Apps</h3>
              {appHits.map((a) => {
                const rc = rowClass(`app:${a.id}`);
                return (
                  <button
                    type="button"
                    {...rc}
                    style={{ color: `var(${a.accentVar})` }}
                    onClick={() => {
                      openApp(a.id);
                      onClose();
                    }}
                  >
                    <AppIcon appId={a.id} size={18} />
                    <span className="palette-title">{a.name}</span>
                    <span className="palette-hint">app</span>
                  </button>
                );
              })}
            </section>
          )}

          {results && results.keyword.length > 0 && (
            <section>
              <h3 className="palette-section">Documents</h3>
              {results.keyword.map((hit) => {
                const rc = rowClass(`kw:${hit.path}`);
                return (
                  <button
                    type="button"
                    {...rc}
                    onClick={() => {
                      openFile(hit.path);
                      onClose();
                    }}
                  >
                    <span className="palette-doc">
                      <span className="palette-title">{hit.title}</span>
                      {hit.space && (
                        <span className="palette-space">{hit.space}</span>
                      )}
                      <span
                        className="palette-snippet"
                        dangerouslySetInnerHTML={{ __html: hit.snippet }}
                      />
                    </span>
                  </button>
                );
              })}
            </section>
          )}

          {results && results.semantic.length > 0 && (
            <section>
              <h3 className="palette-section palette-section-related">Related</h3>
              {results.semantic.map((hit) => {
                const rc = rowClass(`sem:${hit.path}`);
                return (
                  <button
                    type="button"
                    {...rc}
                    onClick={() => {
                      openFile(hit.path);
                      onClose();
                    }}
                  >
                    <span className="palette-doc">
                      <span className="palette-title">{hit.title}</span>
                      {hit.space && (
                        <span className="palette-space">{hit.space}</span>
                      )}
                      <span className="palette-snippet">{hit.snippet}</span>
                    </span>
                  </button>
                );
              })}
            </section>
          )}

          {results && results.semanticStatus === "building" && (
            <p className="palette-status">building semantic index…</p>
          )}
          {query.trim() &&
            results &&
            results.keyword.length === 0 &&
            results.semantic.length === 0 &&
            appHits.length === 0 && (
              <p className="palette-status">Nothing found for “{query}”.</p>
            )}
        </div>
      </div>
    </div>
  );
}
