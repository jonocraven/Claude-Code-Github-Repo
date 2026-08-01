import { useEffect, useMemo, useState } from "react";
import { fetchConnections, formatDate, type Connections, type CrossLink } from "../api";
import { APPS } from "../apps";
import { openFile } from "../store/tabs";

/**
 * Connections — where the eight silos actually touch.
 *
 * The app could already answer "what links to this document", but only once
 * you had found the document, which makes it a confirmation tool rather than a
 * discovery one. These are the three questions the workspace could not answer
 * at all:
 *
 *   Seams        — a link from House Move to Finances is the interesting kind,
 *                  because it is the one place two spaces are the same problem.
 *   Load-bearing — documents many others depend on, which you should know
 *                  before restructuring one.
 *   Forgotten    — nothing points at these and nothing has for months.
 *
 * Seams are grouped by *pair* rather than listed flat. "House Move ↔ Finances,
 * 3 links" is the finding; the individual links are the evidence for it, and
 * burying the first inside the second is how you end up with a list nobody
 * reads.
 */

const SPACES = APPS.filter((a) => a.kind === "space");

const FOLDER_APP = new Map(
  SPACES.map((a) => [a.name.replace(/ /g, "-"), a] as const)
);

function accentFor(folder: string | null): string {
  const app = folder ? FOLDER_APP.get(folder) : undefined;
  return app ? `var(${app.accentVar})` : "var(--ink-faint)";
}

function spaceLabel(folder: string | null): string {
  if (!folder) return "Workspace";
  return FOLDER_APP.get(folder)?.name ?? folder.replace(/-/g, " ");
}

interface Seam {
  key: string;
  a: string;
  b: string;
  links: CrossLink[];
}

/**
 * Group cross-links by unordered space pair. Direction matters for reading an
 * individual link but not for the question "are these two spaces connected",
 * so House Move → Finances and Finances → House Move belong in one row.
 */
export function groupSeams(links: CrossLink[]): Seam[] {
  const seams = new Map<string, Seam>();
  for (const link of links) {
    const [a, b] = [link.sourceSpace, link.targetSpace].sort((x, y) =>
      x.localeCompare(y, "en-GB")
    ) as [string, string];
    const key = `${a}::${b}`;
    const seam = seams.get(key) ?? { key, a, b, links: [] };
    seam.links.push(link);
    seams.set(key, seam);
  }
  return [...seams.values()].sort(
    (x, y) => y.links.length - x.links.length || x.key.localeCompare(y.key, "en-GB")
  );
}

/** How stale, in whole days. Age is what makes an orphan worth looking at. */
export function ageInDays(iso: string, now = Date.now()): number {
  return Math.floor((now - new Date(iso).getTime()) / 86_400_000);
}

function SeamRow({ seam }: { seam: Seam }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="cx-seam">
      <button type="button" className="cx-seam-head" onClick={() => setOpen((o) => !o)}>
        <span className="cx-dot" style={{ background: accentFor(seam.a) }} aria-hidden="true" />
        <span className="cx-seam-name">{spaceLabel(seam.a)}</span>
        <span className="cx-seam-join" aria-hidden="true">↔</span>
        <span className="cx-dot" style={{ background: accentFor(seam.b) }} aria-hidden="true" />
        <span className="cx-seam-name">{spaceLabel(seam.b)}</span>
        <span className="today-count">{seam.links.length}</span>
        <span className="cx-caret" aria-hidden="true">{open ? "⌃" : "⌄"}</span>
      </button>
      {open && (
        <ul className="cx-links">
          {seam.links.map((l) => (
            <li key={`${l.source}->${l.target}`}>
              <button type="button" className="cx-link" onClick={() => openFile(l.source)}>
                <span className="cx-link-pair">
                  {l.sourceTitle} <span aria-hidden="true">→</span> {l.targetTitle}
                </span>
                <span className="cx-link-snippet">{l.snippet}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ConnectionsWindow() {
  const [data, setData] = useState<Connections | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchConnections()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  const seams = useMemo(() => groupSeams(data?.crossLinks ?? []), [data]);

  if (error) {
    return (
      <div className="tree-state" role="alert">
        <p className="tree-state-title">Couldn't read the connection graph</p>
        <p>{error}</p>
      </div>
    );
  }
  if (!data) return <div className="tree-state" role="status">Tracing connections…</div>;

  return (
    <div className="cx">
      <section className="cx-section">
        <h3 className="today-section-title">
          Seams between spaces
          <span className="today-count">{seams.length}</span>
        </h3>
        {seams.length === 0 ? (
          <p className="space-empty">
            Nothing links across a space boundary yet. That is not a fault —
            it just means the eight spaces are still eight separate subjects.
          </p>
        ) : (
          <div className="cx-seams">
            {seams.map((s) => (
              <SeamRow key={s.key} seam={s} />
            ))}
          </div>
        )}
      </section>

      <section className="cx-section">
        <h3 className="today-section-title">
          Load-bearing
          <span className="today-count">{data.hubs.length}</span>
        </h3>
        <p className="cx-note">
          Most connected, in and out. Worth knowing before you restructure one.
        </p>
        <ul className="cx-list">
          {data.hubs.map((h) => (
            <li key={h.path}>
              <button type="button" className="cx-row" onClick={() => openFile(h.path)} title={h.path}>
                <span className="cx-dot" style={{ background: accentFor(h.space) }} aria-hidden="true" />
                <span className="cx-row-name">{h.title}</span>
                <span className="cx-row-meta">{spaceLabel(h.space)}</span>
                <span className="cx-row-num">
                  {h.inbound} in · {h.outbound} out
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="cx-section">
        <h3 className="today-section-title">
          Forgotten
          <span className="today-count">{data.orphans.length}</span>
        </h3>
        <p className="cx-note">
          Nothing links to these, stalest first. Entry points (MEMORY.md,
          CLAUDE.md) and scheduled runs are excluded — nothing links to those by
          design.
        </p>
        <ul className="cx-list">
          {data.orphans.map((o) => (
            <li key={o.path}>
              <button type="button" className="cx-row" onClick={() => openFile(o.path)} title={o.path}>
                <span className="cx-dot" style={{ background: accentFor(o.space) }} aria-hidden="true" />
                <span className="cx-row-name">{o.title}</span>
                <span className="cx-row-meta">{spaceLabel(o.space)}</span>
                <span className="cx-row-num" title={formatDate(o.modified)}>
                  {ageInDays(o.modified)}d
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="cx-section">
        <h3 className="today-section-title">By space</h3>
        <div className="cx-table" role="table">
          <div className="cx-tr cx-th" role="row">
            <span role="columnheader">Space</span>
            <span role="columnheader">Docs</span>
            <span role="columnheader">Internal</span>
            <span role="columnheader">Out</span>
            <span role="columnheader">In</span>
            <span role="columnheader">Forgotten</span>
          </div>
          {data.spaces.map((s) => (
            <div key={s.space} className="cx-tr" role="row">
              <span role="cell" className="cx-td-name">
                <span className="cx-dot" style={{ background: accentFor(s.space) }} aria-hidden="true" />
                {spaceLabel(s.space)}
              </span>
              <span role="cell">{s.docs}</span>
              <span role="cell">{s.internalLinks}</span>
              <span role="cell">{s.outboundCross}</span>
              <span role="cell">{s.inboundCross}</span>
              <span role="cell">{s.orphans}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
