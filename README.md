# App Screenshot Generator

Template-based screenshot asset generator for App Store and Play Store listings

## Export metrics

Successful exports can be recorded in the `Customer App Export Metrics` Google
Sheet. The app sends one row per export action with the number of assets,
template, and export mode. No image data or filenames are sent.

### One-time Google Apps Script setup

1. Open the metrics Sheet and select **Extensions → Apps Script**.
2. Replace the editor contents with `scripts/google-sheets-export-metrics.gs`.
3. In **Project Settings → Script Properties**, add `WRITE_TOKEN` with a long,
   random value.
4. Select **Deploy → New deployment → Web app**. Run it as yourself and allow
   access to anyone so the Vercel server can call it.
5. Copy the deployed web-app URL.

### Vercel environment variables

Add these variables to the Production environment and redeploy:

- `GOOGLE_SHEETS_WEBHOOK_URL`: the deployed Apps Script web-app URL.
- `EXPORT_METRICS_WRITE_TOKEN`: the same value as the Apps Script
  `WRITE_TOKEN` property.

The browser calls `/api/track-export` after a download begins. That server route
validates the metric and forwards it to Google Sheets without exposing the
write token to the browser.

### Export tracker dashboard

`/tracker` shows the Export Log as a dashboard: this week's assets against the
same point last week, a 12-week trend, a template breakdown, the export-mode
split and the latest exports. Weeks run Monday to Sunday in IST. The page is
unlisted (`noindex`) but public, and refreshes its data every minute.

To connect it:

1. In Apps Script **Project Settings → Script Properties**, add `READ_TOKEN`
   with a long, random value (different from `WRITE_TOKEN`).
2. Paste the latest `scripts/google-sheets-export-metrics.gs`, then select
   **Deploy → Manage deployments → Edit → New version** so the URL stays the same.
3. In Vercel, add `EXPORT_METRICS_READ_TOKEN` with the same value as
   `READ_TOKEN` and redeploy.

In local development without these variables, `/tracker` shows sample data
with a "Sample data" badge.
