"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

type FreshnessProps =
  | { status: "ok"; source: "sheet" | "sample"; generatedAt: string }
  | { status: "error" | "unconfigured" };

// Matches the page's revalidate window, so each refresh can bring new rows.
const REFRESH_MS = 60_000;
// Page and data caches can each serve a copy up to a minute old, so allow a
// few refresh cycles before calling the data stale.
const STALE_MS = 5 * 60_000;
const CHECK_MS = 15_000;
// A refresh can bring these back to live; missing env vars need a redeploy.
const RETRYABLE = new Set(["stale", "error"]);

const STATES = {
  live: { label: "Live", detail: "Showing the latest Export Log data." },
  sample: { label: "Sample data", detail: "Local development without the Sheet read token." },
  stale: {
    label: "Not live",
    detail: "The dashboard hasn't refreshed for over 5 minutes. Check the Apps Script deployment.",
  },
  error: {
    label: "Sync failed",
    detail: "The metrics Sheet didn't respond. Check the Apps Script deployment and READ_TOKEN.",
  },
  unconfigured: {
    label: "Not connected",
    detail: "Set GOOGLE_SHEETS_WEBHOOK_URL and EXPORT_METRICS_READ_TOKEN in Vercel.",
  },
} as const;

export function Freshness(props: FreshnessProps) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const [refreshing, startRefresh] = useTransition();
  const generatedMs = props.status === "ok" ? Date.parse(props.generatedAt) : null;

  useEffect(() => {
    setNow(Date.now());
    const check = window.setInterval(() => setNow(Date.now()), CHECK_MS);
    const refresh = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible") {
        setNow(Date.now());
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    window.addEventListener("online", refreshOnReturn);
    return () => {
      window.clearInterval(check);
      window.clearInterval(refresh);
      document.removeEventListener("visibilitychange", refreshOnReturn);
      window.removeEventListener("online", refreshOnReturn);
    };
  }, [router]);

  const state =
    props.status !== "ok"
      ? props.status
      : props.source === "sample"
        ? "sample"
        : now !== null && generatedMs !== null && now - generatedMs > STALE_MS
          ? "stale"
          : "live";
  const { label, detail } = STATES[state];

  return (
    <div className="tracker-freshness" data-state={state} title={detail} role="status">
      <span className="tracker-freshness-dot" aria-hidden="true" />
      <span className="tracker-freshness-label">{label}</span>
      {RETRYABLE.has(state) && (
        <button
          type="button"
          className="tracker-freshness-refresh"
          aria-label="Refresh data"
          title="Refresh data"
          disabled={refreshing}
          data-refreshing={refreshing}
          onClick={() => {
            setNow(Date.now());
            startRefresh(() => router.refresh());
          }}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
            <path d="M12.5 1.5v3h-3" />
          </svg>
        </button>
      )}
    </div>
  );
}
