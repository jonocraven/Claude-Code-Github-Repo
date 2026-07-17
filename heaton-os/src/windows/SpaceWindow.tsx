import { useEffect, useMemo, useRef, useState } from "react";
import {
  fetchFile,
  fetchSpaceTasks,
  formatDate,
  rawUrl,
  type FileResponse,
  type TreeDir,
  type TreeFile,
  type Task,
} from "../api";
import { SPACE_CONFIG, SPACE_HAS_SECTION, type Panel } from "../spaces";
import { TaskList } from "../components/TaskList";
import { filesIn, nodeAt, recentUnder } from "../tree-utils";
import { openFile, useTabs } from "../store/tabs";

function FileChips({ files }: { files: TreeFile[] }) {
  if (files.length === 0) {
    return <p className="space-empty">Nothing here yet.</p>;
  }
  return (
    <ul className="space-filelist">
      {files.map((f) => (
        <li key={f.path}>
          <button type="button" className="space-filerow" onClick={() => openFile(f.path)}>
            <span className="tree-ext">{f.ext || "?"}</span>
            <span className="space-filename">{f.name}</span>
            <span className="tree-meta">{formatDate(f.modified)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function RecipeGrid({ path }: { path: string }) {
  const [rows, setRows] = useState<string[][] | null>(null);
  const [header, setHeader] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    fetch(rawUrl(path))
      .then((r) => (r.ok ? r.text() : ""))
      .then((text) => {
        const lines = text.split(/\r?\n/).filter((l) => l.trim());
        if (lines.length === 0) {
          setRows([]);
          return;
        }
        const split = (l: string) => l.split(",");
        setHeader(split(lines[0]!));
        setRows(lines.slice(1).map(split));
      })
      .catch(() => setRows([]));
  }, [path]);

  if (rows === null) return <p className="space-empty">Loading recipes…</p>;
  if (rows.length === 0) return <p className="space-empty">No recipe file found.</p>;

  const col = (name: string) => header.findIndex((h) => h.toLowerCase() === name);
  const ti = col("title");
  const bi = col("book");
  const ri = col("rating");
  const ci = col("category");

  const filtered = rows.filter((r) =>
    query ? r.join(" ").toLowerCase().includes(query.toLowerCase()) : true
  );

  return (
    <>
      <input
        className="space-search"
        type="text"
        placeholder="Filter recipes…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Filter recipes"
      />
      <div className="recipe-grid">
        {filtered.slice(0, 60).map((r, i) => (
          <article key={i} className="recipe-card">
            <h4 className="recipe-title">{ti >= 0 ? r[ti] : r[0]}</h4>
            {bi >= 0 && <p className="recipe-book">{r[bi]}</p>}
            <div className="recipe-meta">
              {ci >= 0 && r[ci] && <span className="recipe-cat">{r[ci]}</span>}
              {ri >= 0 && r[ri] && (
                <span className="recipe-rating" aria-label={`${r[ri]} out of 5`}>
                  {"★".repeat(Number(r[ri]) || 0)}
                  {"☆".repeat(Math.max(0, 5 - (Number(r[ri]) || 0)))}
                </span>
              )}
            </div>
          </article>
        ))}
      </div>
      <p className="space-count">
        {filtered.length} of {rows.length} recipes
      </p>
    </>
  );
}

function ArtworkGrid({ tree, folder }: { tree: TreeDir; folder: string }) {
  const images = filesIn(tree, folder, ["png", "jpg", "jpeg", "webp", "gif"]);
  if (images.length === 0) return <p className="space-empty">No artwork yet.</p>;
  return (
    <div className="artwork-grid">
      {images.map((img) => (
        <button
          key={img.path}
          type="button"
          className="artwork-thumb"
          onClick={() => openFile(img.path)}
          title={img.name}
        >
          <img src={rawUrl(img.path)} alt={img.name} loading="lazy" />
        </button>
      ))}
    </div>
  );
}

function CvLanes({ tree, base }: { tree: TreeDir; base: string }) {
  const LANES = ["pmm", "proposition", "brand"];
  const [lane, setLane] = useState("pmm");

  const laneFiles = useMemo(() => {
    // Lanes may be subfolders (Resources/cv/pmm/) or filename-tagged.
    const sub = nodeAt(tree, `${base}/${lane}`);
    if (sub && sub.type === "dir") return filesIn(tree, `${base}/${lane}`, ["md", "pdf", "html"]);
    return filesIn(tree, base, ["md", "pdf", "html"]).filter((f) =>
      f.name.toLowerCase().includes(lane)
    );
  }, [tree, base, lane]);

  return (
    <>
      <div className="tabs space-subtabs" role="tablist">
        {LANES.map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={lane === l}
            className={`tab${lane === l ? " is-active" : ""}`}
            onClick={() => setLane(l)}
          >
            {l}
          </button>
        ))}
      </div>
      <FileChips files={laneFiles} />
    </>
  );
}

function FinanceRefresh() {
  // Next bi-monthly refresh: 21st of the next even month (brief §5).
  const next = useMemo(() => {
    const d = new Date();
    for (let i = 0; i < 24; i++) {
      const candidate = new Date(d.getFullYear(), d.getMonth() + i, 21);
      if ((candidate.getMonth() + 1) % 2 === 0 && candidate >= new Date(d.toDateString())) {
        return candidate;
      }
    }
    return null;
  }, []);
  return (
    <div className="finance-refresh">
      <span className="finance-refresh-label">Next bi-monthly refresh</span>
      <span className="finance-refresh-date">
        {next ? formatDate(next.toISOString()) : "—"}
      </span>
      <span className="finance-refresh-sub">21st of even months, 09:00</span>
    </div>
  );
}

function PanelBody({ panel, tree }: { panel: Panel; tree: TreeDir }) {
  switch (panel.kind) {
    case "files": {
      const files = filesIn(tree, panel.folder, panel.exts).filter(
        (f) => !panel.hide?.some((h) => f.path.includes(h))
      );
      return <FileChips files={files} />;
    }
    case "csv":
      return <RecipeGrid path={panel.path} />;
    case "artwork":
      return <ArtworkGrid tree={tree} folder={panel.folder} />;
    case "cv-lanes":
      return <CvLanes tree={tree} base={panel.base} />;
    case "finance-refresh":
      return <FinanceRefresh />;
    case "link":
      return (
        <a className="space-link" href={panel.url} target="_blank" rel="noreferrer">
          {panel.label} ↗
        </a>
      );
  }
}

function MemoryHero({ folder }: { folder: string }) {
  const [doc, setDoc] = useState<FileResponse | null>(null);
  const [missing, setMissing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchFile(`${folder}/MEMORY.md`)
      .then(setDoc)
      .catch(() => setMissing(true));
  }, [folder]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a[data-ref]");
      if (!a) return;
      e.preventDefault();
      const ref2 = a.getAttribute("data-ref");
      if (ref2) openFile(ref2);
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  });

  if (missing) return <p className="space-empty">No MEMORY.md in this space.</p>;
  if (!doc) return <p className="space-empty">Loading space memory…</p>;

  return (
    <div className="space-hero" ref={ref}>
      {doc.frontmatter && doc.frontmatter.length > 0 && (
        <aside className="frontmatter-card">
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
      <div className="reader-body" dangerouslySetInnerHTML={{ __html: doc.html ?? "" }} />
      <button
        type="button"
        className="tree-sort-btn space-hero-open"
        onClick={() => openFile(`${folder}/MEMORY.md`)}
      >
        Open in Reader
      </button>
    </div>
  );
}

function SectionTasks({ spaceId }: { spaceId: string }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [configured, setConfigured] = useState(true);

  useEffect(() => {
    fetchSpaceTasks(spaceId)
      .then((d) => {
        setConfigured(d.configured);
        setTasks(d.tasks);
      })
      .catch(() => setTasks([]));
  }, [spaceId]);

  if (!configured) {
    return <p className="space-empty">Connect Todoist to see this section's tasks.</p>;
  }
  if (!tasks) return <p className="space-empty">Loading tasks…</p>;
  return <TaskList tasks={tasks} emptyLabel="No open tasks in this section." />;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-panel">
      <h3 className="space-panel-title">{title}</h3>
      {children}
    </section>
  );
}

export function SpaceWindow({
  spaceId,
  tree,
}: {
  spaceId: string;
  tree: TreeDir | null;
}) {
  const [tab, setTab] = useState<"dashboard" | "files">("dashboard");
  const reveal = useTabs((s) => s.reveal);
  const config = SPACE_CONFIG[spaceId];

  if (!config) return <p className="space-empty">Unknown space.</p>;

  const recent = tree ? recentUnder(tree, config.folder, 5) : [];

  return (
    <div
      className="spaceapp"
      style={{ "--space-accent": `var(${config.accentVar})` } as React.CSSProperties}
    >
      <header className="space-head">
        <div>
          <h2 className="space-title">{config.name}</h2>
          {config.headerNote && <p className="space-headnote">{config.headerNote}</p>}
        </div>
        <div className="tabs space-tabs">
          <button
            type="button"
            className={`tab${tab === "dashboard" ? " is-active" : ""}`}
            onClick={() => setTab("dashboard")}
          >
            Dashboard
          </button>
          <button
            type="button"
            className={`tab${tab === "files" ? " is-active" : ""}`}
            onClick={() => {
              setTab("files");
              reveal(config.folder);
            }}
          >
            Files
          </button>
        </div>
      </header>

      {tab === "dashboard" ? (
        <div className="space-dashboard">
          <Panel title="Space memory">
            <MemoryHero folder={config.folder} />
          </Panel>

          {SPACE_HAS_SECTION[spaceId] && (
            <Panel title="Tasks">
              <SectionTasks spaceId={spaceId} />
            </Panel>
          )}

          <Panel title="Recently changed">
            <FileChips files={recent} />
          </Panel>

          {config.panels.map((panel, i) => (
            <Panel key={i} title={panel.title}>
              {tree ? (
                <PanelBody panel={panel} tree={tree} />
              ) : (
                <p className="space-empty">Loading…</p>
              )}
            </Panel>
          ))}
        </div>
      ) : (
        <div className="space-files">
          <SpaceFilesTab spaceId={spaceId} tree={tree} folder={config.folder} />
        </div>
      )}
    </div>
  );
}

// Lazy import avoids a cycle: FilesWindow imports the store, not this file.
import { FilesWindow } from "./FilesWindow";
function SpaceFilesTab({
  tree,
  folder,
}: {
  spaceId: string;
  tree: TreeDir | null;
  folder: string;
}) {
  return <FilesWindow tree={tree} error={null} scope={folder} />;
}
