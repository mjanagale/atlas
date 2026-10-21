// The ID from the sheet URL: https://docs.google.com/spreadsheets/d/SHEET_ID/edit
// If this script was created from the sheet itself (Extensions → Apps Script),
// you can leave the placeholder and the bound spreadsheet is used instead.
const SPREADSHEET_ID = "1Hlo4Vldv-QD-fE6ks3Otja2J6LqacT9LOWR0D1Ygp78";
const SHEET_NAME = "Shipments";
const REQUIRED_HEADERS = [
  "Tracking Reference",
  "Status",
  "Last Updated",
  "Customer Update"
];
const CALLBACK_NAME = "atlasTrackingCallback";
const REFERENCE_PATTERN = /^[A-Z0-9-]{4,40}$/;

// Thrown for setup problems; `code` is returned to the website so the browser
// console shows what to fix, without exposing any sheet data.
function SetupError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function openShipmentSheet() {
  let spreadsheet;
  if (SPREADSHEET_ID && SPREADSHEET_ID !== "REPLACE_WITH_YOUR_GOOGLE_SHEET_ID") {
    try {
      spreadsheet = SpreadsheetApp.openById(SPREADSHEET_ID.trim());
    } catch (error) {
      throw SetupError(
        "spreadsheet_unavailable",
        "Could not open the spreadsheet. Check SPREADSHEET_ID and that the deploying account can edit the sheet. " + error.message
      );
    }
  } else {
    spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    if (!spreadsheet) {
      throw SetupError("not_configured", "Set SPREADSHEET_ID in Code.gs (or create the script from the sheet via Extensions → Apps Script).");
    }
  }

  const sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    const tabs = spreadsheet.getSheets().map(function (s) { return '"' + s.getName() + '"'; }).join(", ");
    throw SetupError("sheet_not_found", 'Could not find a tab named "' + SHEET_NAME + '". Tabs found: ' + tabs + ".");
  }
  return sheet;
}

function normalizeHeader(value) {
  return String(value).replace(/\s+/g, " ").trim().toLowerCase();
}

function findColumns(headerRow) {
  const headers = headerRow.map(normalizeHeader);
  const columns = REQUIRED_HEADERS.map(function (header) {
    return headers.indexOf(normalizeHeader(header));
  });
  const missing = REQUIRED_HEADERS.filter(function (header, i) { return columns[i] === -1; });
  if (missing.length) {
    throw SetupError(
      "missing_headers",
      "Row 1 of the sheet is missing: " + missing.join(", ") + ". Found: " + headerRow.join(" | ")
    );
  }
  return columns;
}

function lookupShipment(reference) {
  const sheet = openShipmentSheet();
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 1) {
    throw SetupError("missing_headers", "The sheet is empty. Add the header row first.");
  }
  const columns = findColumns(values[0]);

  for (let rowIndex = 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    const rowReference = String(row[columns[0]] || "").trim().toUpperCase().replace(/\s+/g, "");
    if (rowReference !== reference) continue;

    return {
      status: String(row[columns[1]] || "").trim(),
      updated: String(row[columns[2]] || "").trim(),
      update: String(row[columns[3]] || "").trim()
    };
  }
  return null;
}

function doGet(e) {
  const params = (e && e.parameter) || {};
  const callback = params.callback;
  if (callback !== CALLBACK_NAME) {
    return jsonpResponse(callback, { ok: false, code: "invalid_request" });
  }

  const reference = String(params.reference || "").trim().toUpperCase().replace(/\s+/g, "");
  if (!REFERENCE_PATTERN.test(reference)) {
    return jsonpResponse(callback, { ok: false, code: "invalid_reference" });
  }

  try {
    const shipment = lookupShipment(reference);
    if (!shipment) {
      return jsonpResponse(callback, { ok: false, code: "not_found" });
    }
    return jsonpResponse(callback, { ok: true, shipment: shipment });
  } catch (error) {
    console.error("Shipment lookup failed: " + error.message);
    return jsonpResponse(callback, { ok: false, code: error.code || "lookup_error" });
  }
}

function jsonpResponse(callback, payload) {
  if (callback !== CALLBACK_NAME) {
    return ContentService
      .createTextOutput("Invalid callback.")
      .setMimeType(ContentService.MimeType.TEXT);
  }

  const safeJson = JSON.stringify(payload).replace(/</g, "\\u003c");
  return ContentService
    .createTextOutput(callback + "(" + safeJson + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

// Run once from the editor to grant spreadsheet access.
function authorizeTrackingSheet() {
  openShipmentSheet().getLastRow();
}

// Run from the editor to check the setup. The execution log explains any problem
// and shows the first reference it finds, so you can test it on the website.
function testSetup() {
  const sheet = openShipmentSheet();
  const values = sheet.getDataRange().getDisplayValues();
  const columns = findColumns(values[0] || []);
  console.log('Found tab "' + SHEET_NAME + '" with ' + Math.max(values.length - 1, 0) + " shipment row(s). Headers OK.");

  const firstRow = values.slice(1).find(function (row) { return String(row[columns[0]]).trim(); });
  if (!firstRow) {
    console.log("No shipments yet. Add a row to test a lookup.");
    return;
  }
  const reference = String(firstRow[columns[0]]).trim().toUpperCase();
  const result = doGet({ parameter: { callback: CALLBACK_NAME, reference: reference } }).getContent();
  console.log("Test lookup for " + reference + ": " + result);
}
