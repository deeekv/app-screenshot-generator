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

function jsonResponse(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
