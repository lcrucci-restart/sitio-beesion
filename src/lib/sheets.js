// src/lib/sheets.js
import { ensureToken } from "./googleAuth";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

// fallback (por si no pasás sheetId en los llamados)
const FALLBACK_SHEET_ID =
  import.meta.env.VITE_SHEETS_SPREADSHEET_ID ||
  import.meta.env.VITE_PROG_SHEET_ID ||
  import.meta.env.VITE_N3_SHEET_ID;

if (!FALLBACK_SHEET_ID) {
  console.warn("[sheets.js] No hay sheetId en .env (VITE_SHEETS_SPREADSHEET_ID / VITE_PROG_SHEET_ID / VITE_N3_SHEET_ID). Pasá sheetId en cada llamada a readTable/updateByKey.");
}

function colIdxToA1(idx0) {
  let s = "", n = idx0 + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/**
 * Lee una pestaña de Google Sheets.
 * @param {string} sheetName - Nombre de la pestaña (ej: "Tickets N3")
 * @param {string} [sheetId] - ID del spreadsheet (si no, usa fallback)
 * @param {number} [maxCols=200] - Máximo de columnas a leer
 * @param {number} [maxRows=20000] - Máximo de filas a leer
 */
export async function readTable(sheetName, sheetId = FALLBACK_SHEET_ID, maxCols = 200, maxRows = 20000) {
  if (!sheetId) throw new Error("[readTable] Falta sheetId.");
  const token = await ensureToken();
  const range = encodeURIComponent(`${sheetName}!A1:${colIdxToA1(maxCols - 1)}${maxRows}`);
  const res = await fetch(`${SHEETS_API}/${sheetId}/values/${range}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  const values = json.values || [];
  if (!values.length) return { headers: [], rows: [], raw: [] };

  const headers = values[0].map(h => (h ?? "").toString().trim());
  const rows = values.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i] ?? ""; });
    return obj;
  });
  return { headers, rows, raw: values };
}

/**
 * Escribe por clave (una o varias celdas).
 * @param {string} sheetName - Pestaña
 * @param {string} keyColName - Columna clave (ej: "Identificador de Caso")
 * @param {Array<{key: string, set: Record<string, any>}>} updates
 * @param {string} [sheetId] - ID del spreadsheet (si no, fallback)
 */
export async function updateByKey(sheetName, keyColName, updates, sheetId = FALLBACK_SHEET_ID) {
  if (!sheetId) throw new Error("[updateByKey] Falta sheetId.");
  if (!updates?.length) return { updated: 0 };

  // 1) Leemos para ubicar filas
  const { headers, rows } = await readTable(sheetName, sheetId);
  const keyIdx = headers.indexOf(keyColName);
  if (keyIdx < 0) throw new Error(`No existe columna clave "${keyColName}" en ${sheetName}`);

  const rowIndexByKey = new Map(); // key -> rowNumber (1-based)
  rows.forEach((r, i) => {
    const k = String(r[keyColName] ?? "").trim();
    if (k) rowIndexByKey.set(k, i + 2);
  });

  // 2) Armamos data para batchUpdate
  const data = [];
  updates.forEach(u => {
    const rn = rowIndexByKey.get(String(u.key).trim());
    if (!rn) return; // ignora si no está
    Object.entries(u.set || {}).forEach(([colName, val]) => {
      const ci = headers.indexOf(colName);
      if (ci < 0) return;
      const a1 = `${sheetName}!${colIdxToA1(ci)}${rn}:${colIdxToA1(ci)}${rn}`;
      data.push({ range: a1, values: [[val]] });
    });
  });

  if (!data.length) return { updated: 0 };

  const token = await ensureToken();
  const res = await fetch(`${SHEETS_API}/${sheetId}/values:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
  });
  if (!res.ok) {
    const t = await res.text().catch(()=> "");
    throw new Error(`Sheets batchUpdate error ${res.status}: ${t}`);
  }
  return { updated: data.length };
}


