"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type FreshnessProps = {
  generatedAt: string;
  source: "sheet" | "sample";
};

// Matches the page's revalidate window, so each refresh can bring new rows.
const REFRESH_MS = 60_000;
const TICK_MS = 5_000;

function relativeTime(from: number, now: number) {
  const seconds = Math.max(0, Math.round((now - from) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${Math.floor(seconds / 10) * 10}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} hr ago`;
}

export function Freshness({ generatedAt, source }: FreshnessProps) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const generatedMs = Date.parse(generatedAt);

  useEffect(() => {
    setNow(Date.now());
    const tick = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    const refresh = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    const refreshOnReturn = () => {
      if (document.visibilityState === "visible" && Date.now() - generatedMs > REFRESH_MS) {
        router.refresh();
      }
    };
    document.addEventListener("visibilitychange", refreshOnReturn);
    return () => {
      window.clearInterval(refresh);
      document.removeEventListener("visibilitychange", refreshOnReturn);
    };
  }, [router, generatedMs]);

  const exactTime = new Date(generatedMs).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Kolkata",
  });

  return (
    <div className="tracker-freshness" data-source={source}>
      <span className="tracker-freshness-dot" aria-hidden="true" />
      <span className="tracker-freshness-label">
        {source === "sample" ? "Sample data" : "Live"}
      </span>
      <time
        className="tracker-freshness-time"
        dateTime={generatedAt}
        title={`Updated ${exactTime} IST`}
      >
        Updated {now === null ? "just now" : relativeTime(generatedMs, now)}
      </time>
    </div>
  );
}
