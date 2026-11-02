import { EXPORT_MODES, EXPORT_TEMPLATES } from "@/lib/export-metrics";

const ALLOWED_TEMPLATES = new Set<string>(EXPORT_TEMPLATES);

const ALLOWED_EXPORT_MODES = new Set<string>(EXPORT_MODES);

type ExportMetricPayload = {
  assetsExported?: unknown;
  template?: unknown;
  exportMode?: unknown;
};

export const runtime = "nodejs";

export async function POST(request: Request) {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
  const writeToken = process.env.EXPORT_METRICS_WRITE_TOKEN;

  if (!webhookUrl || !writeToken) {
    return Response.json(
      { error: "Export metrics are not configured." },
      { status: 503 },
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 4096) {
    return Response.json({ error: "Request is too large." }, { status: 413 });
  }

  let payload: ExportMetricPayload;
  try {
    payload = (await request.json()) as ExportMetricPayload;
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { assetsExported, template, exportMode } = payload;
  if (
    !Number.isInteger(assetsExported) ||
    (assetsExported as number) < 1 ||
    (assetsExported as number) > 100 ||
    typeof template !== "string" ||
    !ALLOWED_TEMPLATES.has(template) ||
    typeof exportMode !== "string" ||
    !ALLOWED_EXPORT_MODES.has(exportMode)
  ) {
    return Response.json({ error: "Invalid export metric." }, { status: 400 });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify({
        writeToken,
        recordedAt: new Date().toISOString(),
        assetsExported,
        template,
        exportMode,
      }),
      // Apps Script ContentService replies with a redirect after doPost has
      // completed. Following that redirect can produce a stale 404 even
      // though the row was appended successfully.
      redirect: "manual",
      cache: "no-store",
    });

    if (response.status >= 300 && response.status < 400) {
      return new Response(null, { status: 204 });
    }

    const result = (await response.json().catch(() => null)) as {
      ok?: boolean;
    } | null;

    if (!response.ok || !result?.ok) {
      console.error("Google Sheets export metric webhook failed", {
        status: response.status,
      });
      return Response.json(
        { error: "Unable to record export metric." },
        { status: 502 },
      );
    }

    return new Response(null, { status: 204 });
  } catch (error) {
    console.error("Google Sheets export metric request failed", error);
    return Response.json(
      { error: "Unable to record export metric." },
      { status: 502 },
    );
  }
}
