// src/lib/readSheet.js
import { ensureToken } from "../lib/googleAuth";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

export async function readTab({ sheetId, tabName, gid }) {
  if (!sheetId) throw new Error("sheetId requerido");
  // si hay gid pero no tabName, resolvemos el nombre una vez
  if (!tabName && gid) {
    const meta = await fetch(
      `${API}/${sheetId}?fields=sheets.properties`,
      { headers: { Authorization: `Bearer ${await ensureToken()}` } }
    ).then(r => r.json());
    const match = meta?.sheets?.find(s => String(s?.properties?.sheetId) === String(gid));
    tabName = match?.properties?.title || tabName;
  }
  const activeTab = tabName || `'${(tabName||"Abiertos").replace(/'/g,"''")}'`;
  const quoted = `'${(activeTab).replace(/'/g, "''")}'`;
  const range = `${quoted}!A1:ZZ20000`;

  const res = await fetch(`${API}/${sheetId}/values/${encodeURIComponent(range)}`, {
    headers: { Authorization: `Bearer ${await ensureToken()}` },
  });
  const data = await res.json();
  const values = data?.values || [];
  if (!values.length) return { header: [], rows: [] };

  const header = values[0].map(h => (h||"").trim());
  const rows = values.slice(1)
    .filter(r => r && r.some(c => String(c).trim() !== ""))
    .map(r => Object.fromEntries(header.map((h,i) => [h, r[i] ?? ""])));
  return { header, rows };
}
