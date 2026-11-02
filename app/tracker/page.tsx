import type { Metadata } from "next";

import { Freshness } from "@/components/tracker/freshness";
import { WeeklyChart } from "@/components/tracker/weekly-chart";
import {
  loadExportMetrics,
  type ExportMetrics,
  type ExportTotals,
} from "@/lib/export-metrics";

export const metadata: Metadata = {
  title: "Export Tracker · Customer App Screenshot Studio",
  robots: { index: false, follow: false },
};

export const revalidate = 60;

const numberFormat = new Intl.NumberFormat("en-US");
const TIME_ZONE = "Asia/Kolkata";

const MODE_LABELS: Record<string, string> = {
  all: "Export all",
  selected: "Export selected",
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
}

function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) {
    return (
      <p className="tracker-delta">
        {current === 0 ? "No exports yet this week" : "None by this point last week"}
      </p>
    );
  }
  const change = Math.round(((current - previous) / previous) * 100);
  const direction = change > 0 ? "up" : change < 0 ? "down" : "flat";
  return (
    <p className="tracker-delta" data-direction={direction}>
      {direction !== "flat" && (
        <svg className="tracker-delta-icon" viewBox="0 0 10 10" aria-hidden="true">
          <path d={direction === "up" ? "M5 1.5 9 8.5H1z" : "M5 8.5 1 1.5h8z"} />
        </svg>
      )}
      <span className="tracker-delta-change">
        {change > 0 ? "+" : ""}
        {change}%
      </span>{" "}
      vs {numberFormat.format(previous)} by this point last week
    </p>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="tracker-stat">
      <span className="tracker-stat-label">{label}</span>
      <span className="tracker-stat-value">{numberFormat.format(value)}</span>
      <span className="tracker-stat-note">{note}</span>
    </div>
  );
}

function exportCount(totals: ExportTotals) {
  return `${numberFormat.format(totals.actions)} ${totals.actions === 1 ? "export" : "exports"}`;
}

function Dashboard({ metrics }: { metrics: ExportMetrics }) {
  const templateMax = Math.max(1, ...metrics.templates.map((template) => template.allTime));
  const modeActions = metrics.modes.reduce((sum, mode) => sum + mode.actions, 0);

  return (
    <>
      <section className="tracker-hero">
        <div className="tracker-hero-main">
          <p className="tracker-eyebrow">Assets exported this week</p>
          <p className="tracker-hero-value">{numberFormat.format(metrics.thisWeek.assets)}</p>
          <Delta
            current={metrics.thisWeek.assets}
            previous={metrics.lastWeekToDate.assets}
          />
        </div>
        <div className="tracker-stats">
          <Stat
            label="Export actions this week"
            value={metrics.thisWeek.actions}
            note={`${numberFormat.format(metrics.lastWeek.actions)} last week`}
          />
          <Stat
            label="Assets in the last 7 days"
            value={metrics.last7Days.assets}
            note={exportCount(metrics.last7Days)}
          />
          <Stat
            label="Assets all time"
            value={metrics.allTime.assets}
            note={exportCount(metrics.allTime)}
          />
        </div>
      </section>

      <WeeklyChart weeks={metrics.weeks} />

      <div className="tracker-columns">
        <section className="tracker-panel" aria-labelledby="tracker-templates-title">
          <h2 id="tracker-templates-title" className="tracker-panel-title">
            By template
          </h2>
          <p className="tracker-panel-note">Assets exported, all time</p>
          <ul className="tracker-templates">
            {metrics.templates.map((template) => (
              <li key={template.name} className="tracker-template">
                <div className="tracker-template-row">
                  <span className="tracker-template-name">{template.name}</span>
                  <span className="tracker-template-value">
                    {numberFormat.format(template.allTime)}
                    <span> · {numberFormat.format(template.thisWeek)} this week</span>
                  </span>
                </div>
                <div className="tracker-meter">
                  <div
                    className="tracker-meter-fill"
                    style={{ width: `${(template.allTime / templateMax) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="tracker-panel" aria-labelledby="tracker-modes-title">
          <h2 id="tracker-modes-title" className="tracker-panel-title">
            Export mode
          </h2>
          <p className="tracker-panel-note">Share of export actions, all time</p>
          <div className="tracker-split" data-empty={modeActions === 0} aria-hidden="true">
            {modeActions > 0 && metrics.modes.map((mode) => (
              <div
                key={mode.mode}
                className="tracker-split-part"
                data-mode={mode.mode}
                style={{ flexGrow: mode.actions }}
              />
            ))}
          </div>
          <ul className="tracker-modes">
            {metrics.modes.map((mode) => (
              <li key={mode.mode} className="tracker-mode" data-mode={mode.mode}>
                <span className="tracker-mode-name">
                  {MODE_LABELS[mode.mode] ?? mode.mode}
                </span>
                <span className="tracker-mode-share">
                  {modeActions === 0 ? "–" : `${Math.round((mode.actions / modeActions) * 100)}%`}
                </span>
                <span className="tracker-mode-detail">
                  {numberFormat.format(mode.actions)} exports ·{" "}
                  {numberFormat.format(mode.assets)} assets
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="tracker-panel" aria-labelledby="tracker-recent-title">
        <h2 id="tracker-recent-title" className="tracker-panel-title">
          Recent exports
        </h2>
        {metrics.recent.length === 0 ? (
          <p className="tracker-empty">
            No exports recorded yet. They appear here after the first download.
          </p>
        ) : (
          <div className="tracker-table-wrap">
            <table className="tracker-table">
              <thead>
                <tr>
                  <th scope="col">When (IST)</th>
                  <th scope="col">Template</th>
                  <th scope="col">Mode</th>
                  <th scope="col" className="tracker-table-number">
                    Assets
                  </th>
                </tr>
              </thead>
              <tbody>
                {metrics.recent.map((row, index) => (
                  <tr key={`${row.recordedAt}-${index}`}>
                    <td>{formatTime(row.recordedAt)}</td>
                    <td>{row.template}</td>
                    <td>{MODE_LABELS[row.exportMode] ?? row.exportMode}</td>
                    <td className="tracker-table-number">{row.assetsExported}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export default async function TrackerPage() {
  const result = await loadExportMetrics();

  return (
    <main className="tracker-shell">
      <header className="tracker-header">
        <a href="/" className="tracker-header-home">
          <img
            src="/assets/zuddl-logo-white.svg"
            alt="Zuddl"
            className="studio-header-logo"
          />
          <span className="tracker-header-title">Export tracker</span>
        </a>
        {result.status === "ok" && (
          <Freshness generatedAt={result.metrics.generatedAt} source={result.source} />
        )}
      </header>

      <div className="tracker-page">
        {result.status === "ok" ? (
          <Dashboard metrics={result.metrics} />
        ) : (
          <section className="tracker-panel tracker-notice">
            <h1 className="tracker-panel-title">
              {result.status === "unconfigured"
                ? "Export tracking isn’t connected yet"
                : "Couldn’t load export metrics"}
            </h1>
            <p className="tracker-panel-note">
              {result.status === "unconfigured"
                ? "Set GOOGLE_SHEETS_WEBHOOK_URL and EXPORT_METRICS_READ_TOKEN, then redeploy."
                : "The metrics Sheet didn’t respond. This page retries every minute."}
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
