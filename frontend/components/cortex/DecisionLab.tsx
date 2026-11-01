"use client";

import { useEffect, useMemo, useState } from "react";
import type { DatasetColumn, DatasetRow } from "@/components/table/types";

type Direction = "higher" | "lower";

interface Criterion {
  field: string;
  weight: number;
  direction: Direction;
}

interface Baseline {
  capturedAt: number;
  rows: Record<string, { label: string; data: Record<string, unknown> }>;
}

interface Signal {
  kind: "added" | "removed" | "up" | "down" | "changed";
  label: string;
  field?: string;
  before?: unknown;
  after?: unknown;
  pct?: number;
}

const LOWER_HINTS = /price|cost|fee|rate|latency|\$|usd|inr|per.?hour|min|delay|wait/i;

export function parseNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  if (!Number.isFinite(n)) return null;
  if (/\d\s*k\b/i.test(v)) return n * 1_000;
  if (/\d\s*m\b/i.test(v)) return n * 1_000_000;
  return n;
}

function rowKey(row: DatasetRow, keyCol?: string) {
  const k = keyCol ? row.data[keyCol] : undefined;
  return k != null && String(k).trim() ? String(k).trim().toLowerCase() : row._id;
}

function fmt(v: unknown) {
  if (v == null || v === "") return "—";
  if (typeof v === "number") return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return String(v);
}

export function DecisionLab({
  datasetId,
  datasetName,
  description,
  columns,
  rows,
}: {
  datasetId: string;
  datasetName: string;
  description: string;
  columns: DatasetColumn[];
  rows: DatasetRow[];
}) {
  const labelCol = columns.find((c) => c.isPrimaryKey)?.name ?? columns[0]?.name;

  // Numeric candidates: declared numbers, or text columns where most values parse.
  const numericCols = useMemo(
    () =>
      columns.filter((c) => {
        if (c.type === "number") return true;
        if (c.type !== "text" || rows.length === 0) return false;
        const parsed = rows.filter((r) => parseNumber(r.data[c.name]) !== null).length;
        return parsed / rows.length >= 0.6 && c.name !== labelCol;
      }),
    [columns, rows, labelCol],
  );

  const [criteria, setCriteria] = useState<Criterion[]>([]);
  useEffect(() => {
    setCriteria((prev) =>
      numericCols.map(
        (c) =>
          prev.find((p) => p.field === c.name) ?? {
            field: c.name,
            weight: 50,
            direction: LOWER_HINTS.test(c.name) ? "lower" : "higher",
          },
      ),
    );
  }, [numericCols]);

  const ranked = useMemo(() => {
    const bounds = new Map<string, { min: number; max: number }>();
    for (const c of criteria) {
      const vals = rows.map((r) => parseNumber(r.data[c.field])).filter((n): n is number => n !== null);
      if (vals.length) bounds.set(c.field, { min: Math.min(...vals), max: Math.max(...vals) });
    }
    const totalWeight = criteria.reduce((s, c) => s + c.weight, 0) || 1;
    return rows
      .map((row) => {
        const parts = criteria.map((c) => {
          const n = parseNumber(row.data[c.field]);
          const b = bounds.get(c.field);
          // Missing data never earns credit, even on lower-is-better criteria.
          if (n === null || !b) return { field: c.field, points: 0, missing: true };
          const span = b.max - b.min;
          let norm = span === 0 ? 1 : (n - b.min) / span;
          if (c.direction === "lower") norm = 1 - norm;
          return { field: c.field, points: (norm * c.weight * 100) / totalWeight, missing: false };
        });
        const filled = columns.filter((c) => fmt(row.data[c.name]) !== "—").length;
        return {
          row,
          label: fmt(labelCol ? row.data[labelCol] : row._id),
          score: parts.reduce((s, p) => s + p.points, 0),
          parts,
          quality: Math.round(
            (filled / Math.max(columns.length, 1)) * 80 + ((row.sources?.length ?? 0) > 0 ? 20 : 0),
          ),
        };
      })
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
  }, [rows, criteria, columns, labelCol]);

  // Baseline snapshot lives in this browser only.
  const storageKey = `cortex:baseline:${datasetId}`;
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setBaseline(raw ? (JSON.parse(raw) as Baseline) : null);
    } catch {
      setBaseline(null);
    }
  }, [storageKey]);

  function saveBaseline() {
    const snap: Baseline = { capturedAt: Date.now(), rows: {} };
    for (const r of rows) {
      snap.rows[rowKey(r, labelCol)] = { label: fmt(labelCol ? r.data[labelCol] : r._id), data: r.data };
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(snap));
    } catch {
      /* storage unavailable — keep in memory */
    }
    setBaseline(snap);
  }

  const signals = useMemo<Signal[]>(() => {
    if (!baseline) return [];
    const out: Signal[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      const key = rowKey(r, labelCol);
      seen.add(key);
      const label = fmt(labelCol ? r.data[labelCol] : r._id);
      const prev = baseline.rows[key];
      if (!prev) {
        out.push({ kind: "added", label });
        continue;
      }
      for (const c of columns) {
        const a = prev.data[c.name];
        const b = r.data[c.name];
        if (fmt(a) === fmt(b)) continue;
        const na = parseNumber(a);
        const nb = parseNumber(b);
        if (na !== null && nb !== null && na !== 0) {
          const pct = ((nb - na) / Math.abs(na)) * 100;
          out.push({ kind: nb > na ? "up" : "down", label, field: c.name, before: a, after: b, pct });
        } else {
          out.push({ kind: "changed", label, field: c.name, before: a, after: b });
        }
      }
    }
    for (const [key, prev] of Object.entries(baseline.rows)) {
      if (!seen.has(key)) out.push({ kind: "removed", label: prev.label });
    }
    return out.sort((x, y) => Math.abs(y.pct ?? 0) - Math.abs(x.pct ?? 0));
  }, [baseline, rows, columns, labelCol]);

  function exportBrief() {
    const lines = [
      `# Cortex decision brief — ${datasetName}`,
      "",
      `> ${description}`,
      "",
      `Generated ${new Date().toLocaleString()} from ${rows.length} rows researched by TinyFish web agents (Cortex research pipeline).`,
      "",
      "## Priorities",
      ...criteria.map((c) => `- **${c.field}** — weight ${c.weight}, ${c.direction} is better`),
      "",
      "## Shortlist",
      ...ranked.slice(0, 5).map(
        (r, i) =>
          `${i + 1}. **${r.label}** — fit ${r.score.toFixed(0)}/100, data quality ${r.quality}%` +
          (r.row.sources?.length ? `\n   - Sources: ${r.row.sources.slice(0, 3).join(", ")}` : ""),
      ),
      "",
      "## Signals since baseline",
      ...(baseline
        ? signals.length
          ? signals.slice(0, 20).map((s) => `- ${describe(s)}`)
          : ["- No changes detected."]
        : ["- No baseline saved."]),
      "",
      "_Fit score is a preference ranking from your weights, not a benchmark. Source links show where evidence was found; they are not independent verification._",
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${datasetName.replace(/[^\w-]+/g, "-").toLowerCase()}-cortex-brief.md`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const top = ranked[0];
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="cortex-lab flex-1 overflow-auto">
      <div className="mx-auto grid max-w-[1400px] gap-5 p-5 lg:grid-cols-[320px_1fr_340px]">
        {/* Priorities */}
        <section className="cortex-panel">
          <header className="cortex-panel-head">
            <span className="cortex-kicker">01 · Priorities</span>
            <h2>What matters to you</h2>
          </header>
          {criteria.length === 0 ? (
            <p className="text-sm text-muted">
              No numeric columns detected yet. Add a number column (price, score, size…) to rank rows.
            </p>
          ) : (
            <ul className="space-y-4">
              {criteria.map((c, i) => (
                <li key={c.field}>
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{c.field}</span>
                    <button
                      type="button"
                      className="cortex-chip"
                      onClick={() =>
                        setCriteria((cs) =>
                          cs.map((x, j) =>
                            j === i ? { ...x, direction: x.direction === "higher" ? "lower" : "higher" } : x,
                          ),
                        )
                      }
                    >
                      {c.direction === "higher" ? "↑ higher wins" : "↓ lower wins"}
                    </button>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={c.weight}
                      aria-label={`Weight for ${c.field}`}
                      className="cortex-range flex-1"
                      onChange={(e) =>
                        setCriteria((cs) => cs.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))
                      }
                    />
                    <span className="w-8 text-right font-mono text-xs text-muted">{c.weight}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={exportBrief} className="cortex-btn mt-6 w-full" disabled={rows.length === 0}>
            Export decision brief (.md)
          </button>
        </section>

        {/* Ranking */}
        <section className="cortex-panel">
          <header className="cortex-panel-head flex items-end justify-between gap-3">
            <div>
              <span className="cortex-kicker">02 · Decision</span>
              <h2>Ranked shortlist</h2>
            </div>
            {top && (
              <div className="cortex-best">
                <span>Best fit</span>
                <strong>{top.label}</strong>
              </div>
            )}
          </header>
          {ranked.length === 0 ? (
            <p className="text-sm text-muted">Rows will appear here as TinyFish agents populate the dataset.</p>
          ) : (
            <ol className="space-y-2">
              {ranked.map((r, i) => {
                const open = openId === r.row._id;
                return (
                  <li key={r.row._id} className={`cortex-rank ${i === 0 ? "is-top" : ""}`}>
                    <button
                      type="button"
                      className="flex w-full items-center gap-3 text-left"
                      onClick={() => setOpenId(open ? null : r.row._id)}
                      aria-expanded={open}
                    >
                      <span className="cortex-rank-num">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{r.label}</span>
                        <span className="cortex-bar mt-1.5 block">
                          <span style={{ width: `${Math.max(2, r.score)}%` }} />
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block font-mono text-lg font-bold leading-none">{r.score.toFixed(0)}</span>
                        <span className="text-[10px] uppercase tracking-wider text-muted">fit</span>
                      </span>
                    </button>
                    {open && (
                      <div className="mt-3 space-y-3 border-t border-border pt-3 text-xs">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                          {r.parts.map((p) => (
                            <div key={p.field} className="flex justify-between gap-2">
                              <span className="truncate text-muted">
                                {p.field}: <span className="text-foreground">{fmt(r.row.data[p.field])}</span>
                              </span>
                              <span className="font-mono">{p.missing ? "missing" : `+${p.points.toFixed(1)}`}</span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between text-muted">
                          <span>Data quality {r.quality}% (completeness + sources)</span>
                        </div>
                        {r.row.sources && r.row.sources.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {r.row.sources.slice(0, 4).map((s) => (
                              <a key={s} href={s} target="_blank" rel="noreferrer" className="cortex-source">
                                {safeHost(s)} ↗
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {/* Signals */}
        <section className="cortex-panel">
          <header className="cortex-panel-head">
            <span className="cortex-kicker">03 · Signals</span>
            <h2>What changed</h2>
          </header>
          <p className="text-xs text-muted">
            {baseline
              ? `Comparing against baseline from ${new Date(baseline.capturedAt).toLocaleString()}. Refresh the dataset to let TinyFish agents re-check the web.`
              : "Save a baseline, then refresh the dataset. Cortex diffs the next TinyFish capture against it."}
          </p>
          <button type="button" onClick={saveBaseline} className="cortex-btn-ghost mt-3 w-full" disabled={rows.length === 0}>
            {baseline ? "Re-save baseline from current rows" : "Save baseline snapshot"}
          </button>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <Stat n={signals.filter((s) => s.kind === "added").length} label="new" />
            <Stat n={signals.filter((s) => s.kind === "removed").length} label="absent" />
            <Stat n={signals.filter((s) => s.field).length} label="changed" />
          </div>
          <ul className="mt-4 space-y-2">
            {baseline && signals.length === 0 && <li className="text-sm text-muted">No changes since baseline.</li>}
            {signals.slice(0, 40).map((s, i) => (
              <li key={i} className={`cortex-signal is-${s.kind}`}>
                {describe(s)}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="cortex-stat">
      <strong>{n}</strong>
      <span>{label}</span>
    </div>
  );
}

function describe(s: Signal) {
  switch (s.kind) {
    case "added":
      return `New: ${s.label} appeared in the latest capture`;
    case "removed":
      return `Absent: ${s.label} not in the latest capture`;
    case "up":
    case "down":
      return `${s.label} · ${s.field} ${fmt(s.before)} → ${fmt(s.after)} (${s.pct! > 0 ? "+" : ""}${s.pct!.toFixed(1)}%)`;
    default:
      return `${s.label} · ${s.field} changed: ${fmt(s.before)} → ${fmt(s.after)}`;
  }
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url.slice(0, 30);
  }
}
