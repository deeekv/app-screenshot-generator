export const EXPORT_TEMPLATES = [
  "iOS 6.3 inch",
  "iOS 6.9 inch",
  "iOS 6.5 inch",
  "iOS 5.5 inch",
  "Android 6.8 inch",
] as const;

export const EXPORT_MODES = ["selected", "all"] as const;

// Weeks start on Monday in IST, matching the metrics Sheet's Summary tab.
const TIME_ZONE_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const WEEKS_SHOWN = 12;
const RECENT_SHOWN = 20;

export type ExportRow = {
  recordedAt: string;
  assetsExported: number;
  template: string;
  exportMode: string;
};

export type ExportTotals = {
  assets: number;
  actions: number;
};

export type ExportMetrics = {
  generatedAt: string;
  thisWeek: ExportTotals;
  lastWeek: ExportTotals;
  lastWeekToDate: ExportTotals;
  last7Days: ExportTotals;
  allTime: ExportTotals;
  weeks: (ExportTotals & { start: string; templates: Record<string, number> })[];
  templates: { name: string; thisWeek: number; allTime: number }[];
  modes: (ExportTotals & { mode: string })[];
  recent: ExportRow[];
};

export type ExportMetricsResult =
  | { status: "ok"; source: "sheet" | "sample"; metrics: ExportMetrics }
  | { status: "unconfigured" }
  | { status: "error" };

export async function loadExportMetrics(): Promise<ExportMetricsResult> {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const readToken = process.env.EXPORT_METRICS_READ_TOKEN;

  if (!webhookUrl || !readToken) {
    if (process.env.NODE_ENV === "development") {
      return {
        status: "ok",
        source: "sample",
        metrics: summarizeExports(createSampleRows(new Date())),
      };
    }
    return { status: "unconfigured" };
  }

  try {
    const url = new URL(webhookUrl);
    url.searchParams.set("readToken", readToken);
    const response = await fetch(url, { next: { revalidate: 60 } });
    const result = (await response.json().catch(() => null)) as {
      ok?: boolean;
      rows?: unknown;
    } | null;

    if (!response.ok || !result?.ok || !Array.isArray(result.rows)) {
      console.error("Google Sheets export metrics read failed", {
        status: response.status,
      });
      return { status: "error" };
    }

    return {
      status: "ok",
      source: "sheet",
      metrics: summarizeExports(parseRows(result.rows)),
    };
  } catch (error) {
    console.error("Google Sheets export metrics request failed", error);
    return { status: "error" };
  }
}

function parseRows(rows: unknown[]): ExportRow[] {
  return rows.flatMap((row) => {
    if (!Array.isArray(row)) return [];
    const [recordedAt, assetsExported, template, exportMode] = row;
    if (
      typeof recordedAt !== "string" ||
      Number.isNaN(Date.parse(recordedAt)) ||
      !Number.isFinite(assetsExported)
    ) {
      return [];
    }
    return [
      {
        recordedAt,
        assetsExported: assetsExported as number,
        template: String(template),
        exportMode: String(exportMode),
      },
    ];
  });
}

function weekStart(time: number) {
  const local = time + TIME_ZONE_OFFSET_MS;
  const day = new Date(local).getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  const localMidnight = Math.floor(local / DAY_MS) * DAY_MS;
  return localMidnight - daysSinceMonday * DAY_MS - TIME_ZONE_OFFSET_MS;
}

function add(totals: ExportTotals, row: ExportRow) {
  totals.assets += row.assetsExported;
  totals.actions += 1;
}

export function summarizeExports(rows: ExportRow[], now = new Date()): ExportMetrics {
  const nowMs = now.getTime();
  const thisWeekStart = weekStart(nowMs);
  const lastWeekStart = thisWeekStart - WEEK_MS;
  const firstWeekShown = thisWeekStart - (WEEKS_SHOWN - 1) * WEEK_MS;

  const empty = () => ({ assets: 0, actions: 0 });
  const thisWeek = empty();
  const lastWeek = empty();
  const lastWeekToDate = empty();
  const last7Days = empty();
  const allTime = empty();
  const weeks = Array.from({ length: WEEKS_SHOWN }, (_, index) => ({
    start: new Date(firstWeekShown + index * WEEK_MS + TIME_ZONE_OFFSET_MS)
      .toISOString()
      .slice(0, 10),
    ...empty(),
    templates: {} as Record<string, number>,
  }));
  const templates = new Map<string, { thisWeek: number; allTime: number }>(
    EXPORT_TEMPLATES.map((name) => [name, { thisWeek: 0, allTime: 0 }]),
  );
  const modes = new Map<string, ExportTotals>(
    EXPORT_MODES.map((mode) => [mode, empty()]),
  );

  for (const row of rows) {
    const time = Date.parse(row.recordedAt);
    if (time > nowMs) continue;

    add(allTime, row);
    if (time >= thisWeekStart) add(thisWeek, row);
    else if (time >= lastWeekStart) add(lastWeek, row);
    if (time >= lastWeekStart && time <= nowMs - WEEK_MS) add(lastWeekToDate, row);
    if (time > nowMs - WEEK_MS) add(last7Days, row);

    if (time >= firstWeekShown) {
      const week = weeks[Math.floor((time - firstWeekShown) / WEEK_MS)];
      add(week, row);
      week.templates[row.template] = (week.templates[row.template] ?? 0) + row.assetsExported;
    }

    const template = templates.get(row.template) ?? { thisWeek: 0, allTime: 0 };
    template.allTime += row.assetsExported;
    if (time >= thisWeekStart) template.thisWeek += row.assetsExported;
    templates.set(row.template, template);

    const mode = modes.get(row.exportMode) ?? empty();
    add(mode, row);
    modes.set(row.exportMode, mode);
  }

  return {
    generatedAt: now.toISOString(),
    thisWeek,
    lastWeek,
    lastWeekToDate,
    last7Days,
    allTime,
    weeks,
    templates: [...templates]
      .map(([name, totals]) => ({ name, ...totals }))
      .sort((a, b) => b.allTime - a.allTime),
    modes: [...modes].map(([mode, totals]) => ({ mode, ...totals })),
    recent: [...rows]
      .filter((row) => Date.parse(row.recordedAt) <= nowMs)
      .sort((a, b) => Date.parse(b.recordedAt) - Date.parse(a.recordedAt))
      .slice(0, RECENT_SHOWN),
  };
}

// Deterministic sample data so the dashboard can be checked locally without
// the Sheet's read token.
function createSampleRows(now: Date): ExportRow[] {
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const templateWeights = [0.34, 0.26, 0.18, 0.08, 0.14];
  const rows: ExportRow[] = [];

  for (let daysAgo = 83; daysAgo >= 0; daysAgo -= 1) {
    const exportsToday = Math.floor(random() * (2 + (83 - daysAgo) / 18));
    for (let index = 0; index < exportsToday; index += 1) {
      const time = now.getTime() - daysAgo * DAY_MS - Math.floor(random() * DAY_MS);
      let pick = random();
      const templateIndex = templateWeights.findIndex((weight) => (pick -= weight) < 0);
      const exportMode = random() < 0.62 ? "all" : "selected";
      rows.push({
        recordedAt: new Date(time).toISOString(),
        assetsExported:
          exportMode === "all" ? 4 + Math.floor(random() * 5) : 1 + Math.floor(random() * 3),
        template: EXPORT_TEMPLATES[templateIndex === -1 ? 0 : templateIndex],
        exportMode,
      });
    }
  }

  return rows;
}
