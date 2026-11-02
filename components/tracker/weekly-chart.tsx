"use client";

import {
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

import type { ExportMetrics } from "@/lib/export-metrics";

type WeeklyChartProps = {
  weeks: ExportMetrics["weeks"];
  templates: string[];
};

const numberFormat = new Intl.NumberFormat("en-US");
const tickFormat = new Intl.NumberFormat("en-US", { notation: "compact" });

function weekLabel(start: string) {
  return new Date(`${start}T00:00:00Z`).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// Round ticks: a whole-number 1/2/5 step that gives about three gridlines above zero.
function axisTicks(max: number) {
  const raw = Math.max(3, max) / 3;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].find((factor) => factor * magnitude >= raw)! * magnitude;
  const top = Math.max(step, Math.ceil(max / step) * step);
  return Array.from({ length: top / step + 1 }, (_, index) => index * step);
}

export function WeeklyChart({ weeks, templates }: WeeklyChartProps) {
  const currentIndex = weeks.length - 1;
  // Hover previews a week; a click, tap or arrow key pins it.
  const [pinnedIndex, setPinnedIndex] = useState(currentIndex);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const columnsRef = useRef<HTMLDivElement>(null);
  const ticks = axisTicks(Math.max(...weeks.map((week) => week.assets)));
  const top = ticks[ticks.length - 1];
  const nameOf = (index: number) =>
    index === currentIndex ? "This week" : `Week of ${weekLabel(weeks[index].start)}`;
  // The readout previews the hovered week; the breakdown stays on the pinned one.
  const readoutIndex = hoverIndex ?? pinnedIndex;
  const readout = weeks[readoutIndex];
  const pinned = weeks[pinnedIndex];
  const breakdownMax = Math.max(1, ...templates.map((name) => pinned.templates[name] ?? 0));

  const indexAt = (event: PointerEvent<HTMLDivElement>) => {
    const columns = columnsRef.current;
    if (!columns) return null;
    const rect = columns.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    return Math.min(currentIndex, Math.max(0, Math.floor(ratio * weeks.length)));
  };

  const stepWith = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    setHoverIndex(null);
    setPinnedIndex((index) => Math.min(currentIndex, Math.max(0, index + step)));
  };

  return (
    <section className="tracker-panel tracker-chart" aria-labelledby="tracker-chart-title">
      <div className="tracker-chart-header">
        <div>
          <h2 id="tracker-chart-title" className="tracker-panel-title">
            Assets exported per week
          </h2>
          <p className="tracker-panel-note">
            Click a week to see its devices ·{" "}
            <button
              type="button"
              className="tracker-link-button"
              aria-pressed={showTable}
              onClick={() => setShowTable((value) => !value)}
            >
              {showTable ? "View as chart" : "View as table"}
            </button>
          </p>
        </div>
        {!showTable && (
          <div className="tracker-chart-readout" aria-live="polite">
            <span className="tracker-chart-readout-label">{nameOf(readoutIndex)}</span>
            <span className="tracker-chart-readout-value">
              {numberFormat.format(readout.assets)}
              <span> assets · {numberFormat.format(readout.actions)} exports</span>
            </span>
          </div>
        )}
      </div>

      {showTable ? (
        <div className="tracker-table-wrap">
          <table className="tracker-table">
            <thead>
              <tr>
                <th scope="col">Week starting</th>
                <th scope="col" className="tracker-table-number">
                  Assets
                </th>
                <th scope="col" className="tracker-table-number">
                  Exports
                </th>
                {templates.map((name) => (
                  <th key={name} scope="col" className="tracker-table-number">
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...weeks].reverse().map((week) => (
                <tr key={week.start}>
                  <td>{weekLabel(week.start)}</td>
                  <td className="tracker-table-number">{numberFormat.format(week.assets)}</td>
                  <td className="tracker-table-number">{numberFormat.format(week.actions)}</td>
                  {templates.map((name) => (
                    <td key={name} className="tracker-table-number tracker-table-muted">
                      {numberFormat.format(week.templates[name] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="tracker-chart-plot">
            <div className="tracker-chart-axis" aria-hidden="true">
              {ticks.map((tick) => (
                <span key={tick} style={{ bottom: `${(tick / top) * 100}%` }}>
                  {tickFormat.format(tick)}
                </span>
              ))}
            </div>
            <div
              className="tracker-chart-area"
              role="slider"
              tabIndex={0}
              aria-label="Week"
              aria-valuemin={0}
              aria-valuemax={currentIndex}
              aria-valuenow={pinnedIndex}
              aria-valuetext={`Week of ${weekLabel(weeks[pinnedIndex].start)}: ${weeks[pinnedIndex].assets} assets`}
              aria-controls="tracker-week-breakdown"
              onPointerMove={(event) => setHoverIndex(indexAt(event))}
              onPointerDown={(event) => {
                const index = indexAt(event);
                if (index !== null) setPinnedIndex(index);
              }}
              onPointerLeave={() => setHoverIndex(null)}
              onKeyDown={stepWith}
            >
              <div className="tracker-chart-grid" aria-hidden="true">
                {ticks.map((tick) => (
                  <span key={tick} style={{ bottom: `${(tick / top) * 100}%` }} />
                ))}
              </div>
              <div ref={columnsRef} className="tracker-chart-columns">
                {weeks.map((week, index) => (
                  <div
                    key={week.start}
                    className="tracker-chart-column"
                    data-hovered={index === hoverIndex}
                    data-pinned={index === pinnedIndex}
                  >
                    <div
                      className="tracker-chart-bar"
                      style={{ height: `${(week.assets / top) * 100}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="tracker-chart-labels" aria-hidden="true">
                {weeks.map((week, index) => (
                  <span
                    key={week.start}
                    data-hovered={index === hoverIndex}
                    data-pinned={index === pinnedIndex}
                    data-current={index === currentIndex}
                  >
                    {weekLabel(week.start)}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div id="tracker-week-breakdown" className="tracker-breakdown">
            <p className="tracker-breakdown-title">
              Devices · {pinnedIndex === currentIndex ? "this week" : nameOf(pinnedIndex)}
            </p>
            {pinned.assets === 0 ? (
              <p className="tracker-empty">No exports in this week. Pick another bar.</p>
            ) : (
              <ul className="tracker-breakdown-list">
                {templates.map((name) => {
                  const assets = pinned.templates[name] ?? 0;
                  return (
                    <li key={name} className="tracker-breakdown-row" data-empty={assets === 0}>
                      <span className="tracker-breakdown-name">{name}</span>
                      <div className="tracker-breakdown-track">
                        <div
                          className="tracker-breakdown-bar"
                          style={{ "--share": assets / breakdownMax } as CSSProperties}
                        />
                        <span className="tracker-breakdown-value">
                          {numberFormat.format(assets)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </section>
  );
}
