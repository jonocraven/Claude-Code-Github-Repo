import { useEffect, useState } from "react";
import { fetchMemoryHealth, type MemoryGauge, type MemoryHealth } from "../api";
import { openFile } from "../store/tabs";

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
    <button
      type="button"
      className={`gauge gauge-${gauge.status}`}
      onClick={() => openFile(gauge.path)}
      title={`Open ${gauge.path} in the Reader`}
    >
      <div className="gauge-head">
        <span className={`gauge-dot gauge-dot-${gauge.status}`} aria-hidden="true" />
        <span className="gauge-name">{gauge.label}</span>
        <span className="gauge-status">{gauge.status}</span>
      </div>
      <Bar label="Lines" pct={gauge.linePct} ceiling={gauge.lineCeiling} value={gauge.lines} />
      <Bar label="Words" pct={gauge.wordPct} ceiling={gauge.wordCeiling} value={gauge.words} />
    </button>
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
  if (!health) return <div className="tree-state">Measuring memory files…</div>;

  const breaches = health.gauges.filter((g) => g.status !== "green").length;

  return (
    <div className="memory">
      <header className="memory-head">
        <span className={`memory-verdict memory-verdict-${health.worst}`}>
          {health.worst === "green"
            ? "All within ceilings"
            : health.worst === "amber"
              ? `${breaches} approaching ceiling`
              : `${breaches} over ceiling`}
        </span>
        <span className="memory-sub">Amber at 85% · red at breach</span>
      </header>
      <div className="memory-grid">
        {health.gauges.map((g) => (
          <GaugeCard key={g.path} gauge={g} />
        ))}
      </div>
    </div>
  );
}
