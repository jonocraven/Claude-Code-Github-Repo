import { useEffect, useMemo, useState } from "react";
import { postAction, rawUrl } from "../api";

function ImageViewer({ path }: { path: string }) {
  const [zoomed, setZoomed] = useState(false);
  return (
    <button
      type="button"
      className={`viewer-image${zoomed ? " is-zoomed" : ""}`}
      onClick={() => setZoomed((z) => !z)}
      aria-label={zoomed ? "Zoom out" : "Zoom in"}
    >
      <img src={rawUrl(path)} alt={path.split("/").pop() ?? path} />
    </button>
  );
}

function CsvViewer({ path }: { path: string }) {
  const [text, setText] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [asc, setAsc] = useState(true);

  useEffect(() => {
    fetch(rawUrl(path))
      .then((r) => r.text())
      .then(setText)
      .catch(() => setText(""));
  }, [path]);

  const { header, rows } = useMemo(() => {
    if (!text) return { header: [], rows: [] as string[][] };
    // Simple CSV: quoted fields with commas supported, no embedded newlines.
    const parseLine = (line: string): string[] => {
      const out: string[] = [];
      let cur = "";
      let inQ = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i]!;
        if (inQ) {
          if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (ch === '"') inQ = false;
          else cur += ch;
        } else if (ch === '"') inQ = true;
        else if (ch === ",") { out.push(cur); cur = ""; }
        else cur += ch;
      }
      out.push(cur);
      return out;
    };
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const header = lines.length ? parseLine(lines[0]!) : [];
    const rows = lines.slice(1).map(parseLine);
    return { header, rows };
  }, [text]);

  const sorted = useMemo(() => {
    if (sortCol === null) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = a[sortCol] ?? "";
      const bv = b[sortCol] ?? "";
      const an = Number(av);
      const bn = Number(bv);
      const cmp =
        !Number.isNaN(an) && !Number.isNaN(bn)
          ? an - bn
          : av.localeCompare(bv, "en-GB");
      return asc ? cmp : -cmp;
    });
    return copy;
  }, [rows, sortCol, asc]);

  if (text === null) return <div className="tree-state"><p>Loading…</p></div>;

  return (
    <div className="viewer-csv">
      <table>
        <thead>
          <tr>
            {header.map((h, i) => (
              <th key={i}>
                <button
                  type="button"
                  className="csv-sort"
                  onClick={() => {
                    if (sortCol === i) setAsc((a) => !a);
                    else { setSortCol(i); setAsc(true); }
                  }}
                >
                  {h}
                  {sortCol === i ? (asc ? " ▲" : " ▼") : ""}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, ri) => (
            <tr key={ri}>
              {header.map((_, ci) => (
                <td key={ci}>{row[ci] ?? ""}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TextViewer({ path }: { path: string }) {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    fetch(rawUrl(path))
      .then((r) => r.text())
      .then(setText)
      .catch(() => setText("Couldn't read the file."));
  }, [path]);
  if (text === null) return <div className="tree-state"><p>Loading…</p></div>;
  return <pre className="viewer-text">{text}</pre>;
}

export function ViewerWindow({
  path,
  kind,
}: {
  path: string | undefined;
  kind: string | undefined;
}) {
  if (!path) return null;

  switch (kind) {
    case "image":
      return <ImageViewer path={path} />;
    case "pdf":
      return (
        <iframe className="viewer-frame" src={rawUrl(path)} title={path} />
      );
    case "html":
      // Sandboxed: design artefacts render, scripts stay inert (brief §6).
      return (
        <iframe
          className="viewer-frame"
          src={rawUrl(path)}
          title={path}
          sandbox=""
        />
      );
    case "csv":
      return <CsvViewer path={path} />;
    case "text":
      return <TextViewer path={path} />;
    default:
      return (
        <div className="tree-state">
          <p className="tree-state-title">{path.split("/").pop()}</p>
          <p>No viewer for this type — hand it to the Mac instead.</p>
          <p className="viewer-actions">
            <button
              type="button"
              className="tree-sort-btn"
              onClick={() => void postAction("open", path)}
            >
              Open in default app
            </button>{" "}
            <button
              type="button"
              className="tree-sort-btn"
              onClick={() => void postAction("reveal", path)}
            >
              Reveal in Finder
            </button>
          </p>
        </div>
      );
  }
}
