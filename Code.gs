const SPREADSHEET_ID = "REPLACE_WITH_YOUR_GOOGLE_SHEET_ID";
const SHEET_NAME = "Shipments";
const REQUIRED_HEADERS = [
  "Tracking Reference",
  "Status",
  "Last Updated",
  "Customer Update"
];

function authorizeTrackingSheet() {
  if (SPREADSHEET_ID === "REPLACE_WITH_YOUR_GOOGLE_SHEET_ID") {
    throw new Error("Set SPREADSHEET_ID in Code.gs before authorizing.");
  }

  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error('Could not find the "' + SHEET_NAME + '" sheet tab.');
  }
  sheet.getLastRow();
}

function doGet(e) {
  const callback = e && e.parameter && e.parameter.callback;
  if (callback !== "atlasTrackingCallback") {
    return jsonpResponse(callback, { ok: false, code: "invalid_request" });
  }

  const reference = String((e.parameter && e.parameter.reference) || "")
    .trim()
    .toUpperCase();

  if (!/^[A-Z0-9-]{4,40}$/.test(reference)) {
    return jsonpResponse(callback, { ok: false, code: "invalid_reference" });
  }

  try {
    if (SPREADSHEET_ID === "REPLACE_WITH_YOUR_GOOGLE_SHEET_ID") {
      throw new Error("Set SPREADSHEET_ID in Code.gs before deploying.");
    }

    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(SHEET_NAME);
    if (!sheet) {
      throw new Error('Could not find the "' + SHEET_NAME + '" sheet tab.');
    }

    const values = sheet.getDataRange().getDisplayValues();
    if (values.length < 2) {
      return jsonpResponse(callback, { ok: false, code: "not_found" });
    }

    const headers = values[0].map(function (header) {
      return String(header).trim().toLowerCase();
    });
    const columns = REQUIRED_HEADERS.map(function (header) {
      return headers.indexOf(header.toLowerCase());
    });
    if (columns.some(function (index) { return index === -1; })) {
      throw new Error("The shipment sheet is missing one or more required headers.");
    }

    for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
      const row = values[rowIndex];
      const rowReference = String(row[columns[0]] || "").trim().toUpperCase();
      if (rowReference !== reference) continue;

      return jsonpResponse(callback, {
        ok: true,
        shipment: {
          status: String(row[columns[1]] || "").trim(),
          updated: String(row[columns[2]] || "").trim(),
          update: String(row[columns[3]] || "").trim()
        }
      });
    }

    return jsonpResponse(callback, { ok: false, code: "not_found" });
  } catch (error) {
    console.error("Shipment lookup failed: " + error.message);
    return jsonpResponse(callback, { ok: false, code: "lookup_error" });
  }
}

function jsonpResponse(callback, payload) {
  if (callback !== "atlasTrackingCallback") {
    return ContentService
      .createTextOutput("Invalid callback.")
      .setMimeType(ContentService.MimeType.TEXT);
  }

  const safeJson = JSON.stringify(payload).replace(/</g, "\\u003c");
  return ContentService
    .createTextOutput(callback + "(" + safeJson + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
