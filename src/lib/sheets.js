// src/lib/sheets.js
import { ensureToken } from "./googleAuth";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

/* ───────────────────────── ENV / fallbacks ───────────────────────── */

const ENV = {
  API_KEY:               import.meta.env.VITE_GOOGLE_API_KEY,

  // Fallback spreadsheet id (si no pasás uno explícito en cada call)
  FALLBACK_SHEET_ID:     import.meta.env.VITE_SHEETS_SPREADSHEET_ID
                       || import.meta.env.VITE_PROG_SHEET_ID
                       || import.meta.env.VITE_N3_SHEET_ID,

  // Abiertos (antes Master)
  PROG_ID:               import.meta.env.VITE_PROG_SHEET_ID,
  PROG_TAB:              import.meta.env.VITE_PROG_SHEET_TAB || "Abiertos",
  PROG_GID:              import.meta.env.VITE_PROG_SHEET_GID,

  // Cerrados
  CERR_ID:               import.meta.env.VITE_CERR_SHEET_ID,
  CERR_TAB:              import.meta.env.VITE_CERR_SHEET_TAB || "Cerrados",
  CERR_GID:              import.meta.env.VITE_CERR_SHEET_GID,

  // N3
  N3_ID:                 import.meta.env.VITE_N3_SHEET_ID,
  N3_TAB:                import.meta.env.VITE_N3_SHEET_TAB || "Tickets N3",
  N3_GID:                import.meta.env.VITE_N3_SHEET_GID,

  // Reportes (nuevas pestañas donde volcás los exports de InvGate)
  // Si no definís un ID propio, usa el FALLBACK_SHEET_ID
  REP_ID:                import.meta.env.VITE_REPORTES_SHEET_ID,
  REP_ABIERTOS_TAB:      import.meta.env.VITE_REPORTES_ABIERTOS_TAB || "Reporte Abiertos",
  REP_ABIERTOS_GID:      import.meta.env.VITE_REPORTES_ABIERTOS_GID,
  REP_CERRADOS_TAB:      import.meta.env.VITE_REPORTES_CERRADOS_TAB || "Reporte Cerrados",
  REP_CERRADOS_GID:      import.meta.env.VITE_REPORTES_CERRADOS_GID,
};

if (!ENV.FALLBACK_SHEET_ID) {
  console.warn("[sheets.js] No hay sheetId de fallback en .env (VITE_SHEETS_SPREADSHEET_ID / VITE_PROG_SHEET_ID / VITE_N3_SHEET_ID). Pasá sheetId en cada llamada o completá el .env.");
}

/* ───────────────────────── utils ───────────────────────── */

function colIdxToA1(idx0) {
  let s = "", n = idx0 + 1;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function keyParam() {
  const k = ENV.API_KEY;
  return k ? `?key=${k}` : "";
}

// alias para no romper llamados viejos con "Master"
function aliasTabName(tabName, sheetId) {
  if (!tabName) return tabName;
  if (tabName.trim().toLowerCase() === "master") {
    // si apunta al libro de Abiertos (o si no sabemos cuál es, igual lo mapeamos a Abiertos)
    if (!sheetId || sheetId === ENV.PROG_ID || sheetId === ENV.FALLBACK_SHEET_ID) {
      return ENV.PROG_TAB; // "Abiertos"
    }
  }
  return tabName;
}

// resuelve el nombre de pestaña a partir de gid (si no se pasa tabName)
async function resolveTabNameByGid(sheetId, tabName, gid) {
  if (tabName) return tabName;
  if (!gid) return tabName;

  const token = await ensureToken();
  const url = `${SHEETS_API}/${sheetId}?fields=sheets.properties${keyParam()}`;
  const meta = await fetch(url, { headers: { Authorization: `Bearer ${token}` }}).then(r => r.json());
  const m = meta?.sheets?.find(s => String(s?.properties?.sheetId) === String(gid));
  return m?.properties?.title || tabName;
}

/* ───────────────────────── core ───────────────────────── */

/**
 * Lee una pestaña de Google Sheets.
 *
 * 2 formas de uso:
 *   readTable("Abiertos", sheetId?)
 *   readTable({ sheetId, tab, gid, maxCols, maxRows })
 */
export async function readTable(arg1, sheetId, maxCols = 200, maxRows = 20000) {
  let tab = null;
  let gid = null;

  // modo opciones
  if (typeof arg1 === "object" && arg1) {
    tab     = arg1.tab || arg1.sheetName || null;
    gid     = arg1.gid || null;
    sheetId = arg1.sheetId || sheetId || ENV.FALLBACK_SHEET_ID;
    maxCols = arg1.maxCols || maxCols;
    maxRows = arg1.maxRows || maxRows;
  } else {
    // modo posicional
    tab     = arg1;
    sheetId = sheetId || ENV.FALLBACK_SHEET_ID;
  }

  if (!sheetId) throw new Error("[readTable] Falta sheetId.");

  // mapeo de alias "Master" -> Abiertos
  tab = aliasTabName(tab, sheetId);

  // si no hay tab pero hay gid, resolver
  tab = await resolveTabNameByGid(sheetId, tab, gid);

  if (!tab) throw new Error("[readTable] Falta nombre de pestaña (tab).");

  const token = await ensureToken();
  const range = encodeURIComponent(`${tab.replace(/'/g, "''")}!A1:${colIdxToA1(maxCols - 1)}${maxRows}`);
  const url = `${SHEETS_API}/${sheetId}/values/${range}${keyParam()}`;

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const t = await res.text().catch(()=>"");
    throw new Error(`[readTable] HTTP ${res.status}: ${t}`);
  }

  const json = await res.json();
  const values = json.values || [];
  if (!values.length) return { headers: [], rows: [], raw: [] };

  const headers = values[0].map(h => (h ?? "").toString().trim());
  const rows = values.slice(1)
    .filter(r => r && r.some(c => String(c ?? "").trim() !== ""))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));

  return { headers, rows, raw: values };
}

/**
 * Escribe por clave (una o varias celdas) en una pestaña.
 * @param {string|object} tabOrOpts - "Abiertos" o { sheetId, tab, gid }
 * @param {string} keyColName       - columna clave en la pestaña destino
 * @param {Array<{key: string, set: Record<string, any>}>} updates
 * @param {string} [sheetId]        - si no viene en opts, usa fallback/env
 */
export async function updateByKey(tabOrOpts, keyColName, updates, sheetId) {
  let tab = null;
  let gid = null;

  if (typeof tabOrOpts === "object" && tabOrOpts) {
    tab     = tabOrOpts.tab || tabOrOpts.sheetName || null;
    gid     = tabOrOpts.gid || null;
    sheetId = tabOrOpts.sheetId || sheetId || ENV.FALLBACK_SHEET_ID;
  } else {
    tab     = tabOrOpts;
    sheetId = sheetId || ENV.FALLBACK_SHEET_ID;
  }

  if (!sheetId) throw new Error("[updateByKey] Falta sheetId.");
  if (!updates?.length) return { updated: 0 };

  tab = aliasTabName(tab, sheetId);
  tab = await resolveTabNameByGid(sheetId, tab, gid);
  if (!tab) throw new Error("[updateByKey] Falta nombre de pestaña (tab).");

  // 1) leer header/filas para ubicar índices
  const { headers, rows } = await readTable({ sheetId, tab });
  const keyIdx = headers.indexOf(keyColName);
  if (keyIdx < 0) throw new Error(`[updateByKey] No existe columna clave "${keyColName}" en ${tab}`);

  const rowIndexByKey = new Map(); // key -> rowNumber (1-based)
  rows.forEach((r, i) => {
    const k = String(r[keyColName] ?? "").trim();
    if (k) rowIndexByKey.set(k, i + 2);
  });

  // 2) armar batch
  const data = [];
  updates.forEach(u => {
    const rn = rowIndexByKey.get(String(u.key).trim());
    if (!rn) return; // ignora si no está
    Object.entries(u.set || {}).forEach(([colName, val]) => {
      const ci = headers.indexOf(colName);
      if (ci < 0) return;
      const a1 = `${tab.replace(/'/g, "''")}!${colIdxToA1(ci)}${rn}:${colIdxToA1(ci)}${rn}`;
      data.push({ range: a1, values: [[val]] });
    });
  });

  if (!data.length) return { updated: 0 };

  const token = await ensureToken();
  const res = await fetch(`${SHEETS_API}/${sheetId}/values:batchUpdate${keyParam()}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
  });
  if (!res.ok) {
    const t = await res.text().catch(()=> "");
    throw new Error(`[updateByKey] batchUpdate ${res.status}: ${t}`);
  }
  return { updated: data.length };
}

/* ─────────────────── helpers rápidos por libro/pestaña ─────────────────── */

export async function readAbiertos() {
  const id  = ENV.PROG_ID || ENV.FALLBACK_SHEET_ID;
  const tab = ENV.PROG_TAB;
  return readTable({ sheetId: id, tab, gid: ENV.PROG_GID });
}

export async function readCerrados() {
  const id  = ENV.CERR_ID || ENV.FALLBACK_SHEET_ID;
  const tab = ENV.CERR_TAB;
  return readTable({ sheetId: id, tab, gid: ENV.CERR_GID });
}

export async function readN3() {
  const id  = ENV.N3_ID || ENV.FALLBACK_SHEET_ID;
  const tab = ENV.N3_TAB;
  return readTable({ sheetId: id, tab, gid: ENV.N3_GID });
}

/* ─────────────────── helpers específicos de REPORTES ─────────────────── */

export async function readReporteAbiertos() {
  const id  = ENV.REP_ID || ENV.FALLBACK_SHEET_ID;
  const tab = ENV.REP_ABIERTOS_TAB;     // "Reporte Abiertos"
  return readTable({ sheetId: id, tab, gid: ENV.REP_ABIERTOS_GID, maxCols: 200, maxRows: 50000 });
}

export async function readReporteCerrados() {
  const id  = ENV.REP_ID || ENV.FALLBACK_SHEET_ID;
  const tab = ENV.REP_CERRADOS_TAB;     // "Reporte Cerrados"
  return readTable({ sheetId: id, tab, gid: ENV.REP_CERRADOS_GID, maxCols: 200, maxRows: 50000 });
}

// ===== Gemini (insights desde pestaña dedicada) =====
export async function readGeminiInsights() {
  // Usamos el mismo libro de Reportes
  const id  = ENV.REP_ID || ENV.FALLBACK_SHEET_ID;
  // Pestaña, configurable por env si querés
  const tab = import.meta.env.VITE_GEMINI_TAB || "Gemini";

  if (!id) {
    throw new Error("[readGeminiInsights] Falta REP_ID o FALLBACK_SHEET_ID.");
  }

  return readTable({
    sheetId: id,
    tab,
    maxCols: 20,
    maxRows: 500,
  });
}

