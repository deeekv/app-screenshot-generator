const SPREADSHEET_ID = "1VyVljLDl8Yz3tlsogIbLVpWVCkg1hyRyoYVnyvM3FFk";
const SHEET_NAME = "Export Log";

function doPost(event) {
  const lock = LockService.getScriptLock();

  try {
    const payload = JSON.parse(event.postData.contents || "{}");
    const expectedToken = PropertiesService.getScriptProperties().getProperty("WRITE_TOKEN");

    if (!expectedToken || payload.writeToken !== expectedToken) {
      return jsonResponse({ ok: false, error: "Unauthorized" });
    }

    const assetsExported = Number(payload.assetsExported);
    const allowedTemplates = [
      "iOS 6.3 inch",
      "iOS 6.9 inch",
      "iOS 6.5 inch",
      "iOS 5.5 inch",
      "Android 6.8 inch",
    ];
    const allowedExportModes = ["selected", "all"];

    if (
      !Number.isInteger(assetsExported) ||
      assetsExported < 1 ||
      assetsExported > 100 ||
      !allowedTemplates.includes(payload.template) ||
      !allowedExportModes.includes(payload.exportMode)
    ) {
      return jsonResponse({ ok: false, error: "Invalid export metric" });
    }

    lock.waitLock(10000);

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) {
      return jsonResponse({ ok: false, error: "Export Log sheet not found" });
    }

    sheet.appendRow([
      new Date(payload.recordedAt),
      assetsExported,
      payload.template,
      payload.exportMode,
    ]);
    // appendRow applies the locale's default date format; keep the log's own.
    sheet.getRange(sheet.getLastRow(), 1).setNumberFormat("d mmm yyyy, hh:mm");

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, error: "Unable to record export metric" });
  } finally {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
  }
}

function doGet(event) {
  try {
    const expectedToken = PropertiesService.getScriptProperties().getProperty("READ_TOKEN");
    const readToken = event && event.parameter ? event.parameter.readToken : "";

    if (!expectedToken || readToken !== expectedToken) {
      return jsonResponse({ ok: false, error: "Unauthorized" });
    }

    const spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(SHEET_NAME);
    if (!sheet) {
      return jsonResponse({ ok: false, error: "Export Log sheet not found" });
    }

    const lastRow = sheet.getLastRow();
    const values = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 4).getValues() : [];
    const rows = values
      .filter((row) => row[0] instanceof Date && !isNaN(row[0].getTime()))
      .map((row) => [row[0].toISOString(), Number(row[1]), String(row[2]), String(row[3])]);

    return jsonResponse({ ok: true, rows });
  } catch (error) {
    console.error(error);
    return jsonResponse({ ok: false, error: "Unable to read export metrics" });
  }
}

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
