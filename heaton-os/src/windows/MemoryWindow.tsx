import { useEffect, useState } from "react";
import {
  fetchMemoryHealth,
  type MemoryEntry,
  type MemoryGauge,
  type MemoryHealth,
} from "../api";
import { openFile } from "../store/tabs";

/**
 * Memory — what the workspace knows, and what it is still asking.
 *
 * This used to weigh files against their ceilings and stop there, which told
 * you a file was too long but nothing about what was in it. Now the same
 * files are read as structure (server/memory-structure.ts), so the app can
 * answer "what's still open across everything?" and, for a file that has
 * breached, say which section is actually carrying the weight.
 *
 * Size stays on screen because the ceilings are real, but it is no longer
 * the headline.
 */

const KIND_LABEL: Record<string, string> = {
  fact: "facts",
  decision: "decisions",
  open: "open",
  note: "notes",
};

function OpenItem({ entry, gauge }: { entry: MemoryEntry; gauge: MemoryGauge }) {
  return (
    <li>
      <button
        type="button"
        className="mem-open-row"
        onClick={() => openFile(gauge.path)}
        title={`${gauge.path}, line ${entry.line}`}
      >
        <span className="mem-open-space">{gauge.label}</span>
        <span className="mem-open-text">{entry.text}</span>
      </button>
    </li>
  );
}

/** The composition bar: what the file is made of, at a glance. */
function Composition({ gauge }: { gauge: MemoryGauge }) {
  const { counts } = gauge.structure;
  const total = counts.fact + counts.decision + counts.open + counts.note;
  if (total === 0) return null;
  const kinds = (["fact", "decision", "open", "note"] as const).filter((k) => counts[k] > 0);
  return (
    <div className="mem-comp">
      <div className="mem-comp-bar" aria-hidden="true">
        {kinds.map((k) => (
          <span
            key={k}
            className={`mem-comp-seg mem-comp-${k}`}
            style={{ width: `${(counts[k] / total) * 100}%` }}
          />
        ))}
      </div>
      <p className="mem-comp-key">
        {kinds.map((k) => (
          <span key={k} className="mem-comp-item">
            <span className={`mem-comp-dot mem-comp-${k}`} aria-hidden="true" />
            {counts[k]} {KIND_LABEL[k]}
          </span>
        ))}
      </p>
    </div>
  );
}

/**
 * The trim hint. A file with sections can be pointed at its heaviest one; a
 * file with none is the more interesting case — the honest advice there is
 * that there is no structure to work with yet, which is the actual problem.
 */
function TrimHint({ gauge }: { gauge: MemoryGauge }) {
  if (gauge.status === "green") return null;
  const { sections, entries } = gauge.structure;
  const real = sections.filter((s) => s.name !== "—");

  if (entries.length === 0) {
    return (
      <p className="mem-trim">
        Over the ceiling with no headings or lists to work from — this one needs
        organising before it can be trimmed sensibly.
      </p>
    );
  }
  if (real.length === 0) {
    return (
      <p className="mem-trim">
        {entries.length} entries, none under a heading. Grouping them into
        sections would show what is safe to cut.
      </p>
    );
  }
  const biggest = real.reduce((a, b) => (b.count > a.count ? b : a));
  return (
    <p className="mem-trim">
      Heaviest section is <strong>{biggest.name}</strong> at {biggest.count} of{" "}
      {entries.length} entries — start there.
    </p>
  );
}

function Bar({ label, pct, ceiling, value }: { label: string; pct: number; ceiling: number; value: number }) {
  return (
    <div className="gauge-bar">
      <div className="gauge-bar-label">
        <span>{label}</span>
        <span className="gauge-bar-count">
          {value} / {ceiling}
        </span>
      </div>
      <div className="gauge-track">
        <div className="gauge-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
        {pct > 100 && <div className="gauge-over" />}
      </div>
    </div>
  );
}

function GaugeCard({ gauge }: { gauge: MemoryGauge }) {
  return (
    <article className={`gauge gauge-${gauge.status}`}>
      <button
        type="button"
        className="gauge-head gauge-open"
        onClick={() => openFile(gauge.path)}
        title={`Open ${gauge.path} in the Reader`}
      >
        <span className={`gauge-dot gauge-dot-${gauge.status}`} aria-hidden="true" />
        <span className="gauge-name">{gauge.label}</span>
        <span className="gauge-status">{gauge.status}</span>
      </button>
      <Composition gauge={gauge} />
      <TrimHint gauge={gauge} />
      <Bar label="Lines" pct={gauge.linePct} ceiling={gauge.lineCeiling} value={gauge.lines} />
      <Bar label="Words" pct={gauge.wordPct} ceiling={gauge.wordCeiling} value={gauge.words} />
    </article>
  );
}

export function MemoryWindow() {
  const [health, setHealth] = useState<MemoryHealth | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMemoryHealth()
      .then(setHealth)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="tree-state" role="alert">
        <p className="tree-state-title">Couldn't read memory health</p>
        <p>{error}</p>
      </div>
    );
  }
  if (!health) return <div className="tree-state" role="status">Measuring memory files…</div>;

  const over = health.gauges.filter((g) => g.status === "red").length;
  const near = health.gauges.filter((g) => g.status === "amber").length;
  const verdict =
    over === 0 && near === 0
      ? "All within ceilings"
      : [over > 0 ? `${over} over ceiling` : null, near > 0 ? `${near} approaching` : null]
          .filter(Boolean)
          .join(" · ");

  // Every unresolved item, wherever it lives. The cross-space question the
  // per-file gauges could never answer.
  const openItems = health.gauges.flatMap((g) =>
    g.structure.entries.filter((e) => e.kind === "open").map((e) => ({ entry: e, gauge: g }))
  );

  return (
    <div className="memory">
      <header className="memory-head">
        <span className={`memory-verdict memory-verdict-${health.worst}`}>{verdict}</span>
        <span className="memory-sub">Amber at 85% · red at breach</span>
      </header>

      <section className="mem-open">
        <h3 className="today-section-title">
          Still open
          <span className="today-count">{openItems.length}</span>
        </h3>
        {openItems.length === 0 ? (
          <p className="space-empty">
            Nothing marked open across the workspace. Memory records questions
            written as <code>[TODO …]</code>, an unticked <code>[ ]</code> box,
            or a line ending in a question mark.
          </p>
        ) : (
          <ul className="mem-open-list">
            {openItems.map(({ entry, gauge }) => (
              <OpenItem key={`${gauge.path}:${entry.line}`} entry={entry} gauge={gauge} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="today-section-title">
          Files
          <span className="today-count">{health.gauges.length}</span>
        </h3>
        <div className="memory-grid">
          {health.gauges.map((g) => (
            <GaugeCard key={g.path} gauge={g} />
          ))}
        </div>
      </section>
    </div>
  );
}
