// src/pages/Reportes.jsx
import React from "react";
import { hasGoogle, initTokenClient, ensureToken, isSignedIn } from "../lib/googleAuth";
import { BarChart2 } from "lucide-react";

const API     = "https://sheets.googleapis.com/v4/spreadsheets";
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;

// Abiertos
const PROG_ID  = import.meta.env.VITE_PROG_SHEET_ID;
const PROG_TAB = import.meta.env.VITE_PROG_SHEET_TAB || "Abiertos";
const PROG_GID = import.meta.env.VITE_PROG_SHEET_GID;

// Cerrados
const CERR_ID  = import.meta.env.VITE_CERR_SHEET_ID || PROG_ID; // mismo archivo si querés
const CERR_TAB = import.meta.env.VITE_CERR_SHEET_TAB || "Cerrados";
const CERR_GID = import.meta.env.VITE_CERR_SHEET_GID;

const MESAS_TARGET = new Set(["beesion","tenfold","invgate","sharepoint"]);
const CLOSED_STATES = new Set(["resuelto","rechazados","cancelados","cerrados"].map(s=>s.toLowerCase()));

const NORM = (s) =>
  (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

const isEvo = (row) => NORM(row?.["Tipo"]) === "pedido de cambio";

function parseDateMaybe(v) {
  if (v instanceof Date) return v;
  const s = (v || "").toString().trim();
  if (!s) return null;
  // dd/mm/yyyy [hh:mm]
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(s);
  if (m) {
    const d = +m[1],
      mo = +m[2] - 1,
      yy = +m[3];
    const y = yy < 100 ? 2000 + yy : yy;
    const H = +m[4] || 0,
      M = +m[5] || 0;
    const dt = new Date(y, mo, d, H, M, 0, 0);
    return isNaN(dt) ? null : dt;
  }
  const d2 = new Date(s);
  return isNaN(d2) ? null : d2;
}

function withinLastDays(date, days) {
  const d = parseDateMaybe(date);
  if (!d) return false;
  const now = new Date();
  const from = new Date(now.getTime() - days * 86400000);
  return d >= from && d <= now;
}

async function readTab({ sheetId, tabName, gid }) {
  if (!sheetId) throw new Error("sheetId requerido");
  // si hay gid pero no tabName, resolvemos el nombre
  if (!tabName && gid) {
    const meta = await fetch(
      `${API}/${sheetId}?fields=sheets.properties&key=${API_KEY}`,
      { headers: { Authorization: `Bearer ${await ensureToken()}` } }
    ).then((r) => r.json());
    const match = meta?.sheets?.find(
      (s) => String(s?.properties?.sheetId) === String(gid)
    );
    tabName = match?.properties?.title || tabName;
  }
  const activeTab = tabName || "Abiertos";
  const quoted = `'${activeTab.replace(/'/g, "''")}'`;
  const range = `${quoted}!A1:ZZ20000`;

  const data = await fetch(
    `${API}/${sheetId}/values/${encodeURIComponent(range)}?key=${API_KEY}`,
    { headers: { Authorization: `Bearer ${await ensureToken()}` } }
  ).then((r) => r.json());

  const values = data?.values || [];
  if (!values.length) return { header: [], rows: [] };

  const header = values[0].map((h) => (h || "").trim());
  const rows = values
    .slice(1)
    .filter((r) => r && r.some((c) => String(c).trim() !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
  return { header, rows };
}

function groupCount(arr, key) {
  const m = new Map();
  for (const r of arr) {
    const k = (r[key] || "—").toString().trim() || "—";
    m.set(k, (m.get(k) || 0) + 1);
  }
  return Array.from(m.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

export default function Reportes() {
  const [ready, setReady] = React.useState(isSignedIn());
  const [loading, setLoading] = React.useState(false);
  const [warn, setWarn] = React.useState(null);

  const [rowsA, setRowsA] = React.useState([]); // Abiertos
  const [rowsC, setRowsC] = React.useState([]); // Cerrados

  React.useEffect(() => {
    if (!hasGoogle()) return;
    initTokenClient();
  }, []);

  const connect = async () => {
    await ensureToken();
    setReady(true);
  };

  React.useEffect(() => {
    let alive = true;
    (async () => {
      if (!ready) return;
      try {
        setLoading(true);
        setWarn(null);
        const [{ rows: a }, { rows: c }] = await Promise.all([
          readTab({ sheetId: PROG_ID, tabName: PROG_TAB, gid: PROG_GID }),
          readTab({ sheetId: CERR_ID, tabName: CERR_TAB, gid: CERR_GID }),
        ]);
        if (!alive) return;
        setRowsA(a || []);
        setRowsC(c || []);
      } catch (e) {
        console.error("Reportes: no pude leer hojas", e);
        if (alive) setWarn("No pude leer las hojas (revisá permisos/API key/token).");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ready]);

  // --------- helpers de campos ---------
  const mesaOf = (r) => (r["Mesa"] ?? r["Mesa asignada"] ?? "—");
  const cierreCol = React.useMemo(() => {
    // Cerrados → preferimos "Fecha fin", pero aceptamos variantes por si cambian el header
    const candidates = [
      "Fecha fin",
      "Fecha de solución",
      "Fecha de rechazo",
      "Fecha de cancelación",
      "Fecha cierre",
      "Resolved At",
      "Closed At",
    ].map(NORM);
    const keys = rowsC.length ? Object.keys(rowsC[0]) : [];
    const found = keys.find((k) => candidates.includes(NORM(k)));
    if (!found) {
      setWarn((w) => w || "No encuentro columna de cierre en Cerrados (p. ej. “Fecha fin”).");
    }
    return found || null;
  }, [rowsC]);

  // Filtrar por mesas target
  const targetA = React.useMemo(
    () => rowsA.filter((r) => MESAS_TARGET.has(NORM(mesaOf(r)))),
    [rowsA]
  );
  const targetC = React.useMemo(
    () => rowsC.filter((r) => MESAS_TARGET.has(NORM(mesaOf(r)))),
    [rowsC]
  );

  // 1) NO EVOLUTIVOS CREADOS 30d (Abiertos ∪ Cerrados, por si cerró rápido)
  const unionCreados = React.useMemo(() => {
    // dedupe por ID/Nro (toman cualquiera)
    const map = new Map();
    const push = (r) => {
      const id = (r["Invgate"] ?? r["Nro"] ?? "").toString();
      if (!id) return;
      if (!map.has(id)) map.set(id, r);
    };
    targetA.forEach(push);
    targetC.forEach(push);
    return Array.from(map.values());
  }, [targetA, targetC]);

  const noEvoCreados30 = React.useMemo(
    () =>
      unionCreados.filter(
        (r) => !isEvo(r) && withinLastDays(r["Fecha de creación"], 30)
      ).length,
    [unionCreados]
  );

  // 2) EVOLUTIVOS CREADOS 30d
  const evoCreados30 = React.useMemo(
    () =>
      unionCreados.filter(
        (r) => isEvo(r) && withinLastDays(r["Fecha de creación"], 30)
      ).length,
    [unionCreados]
  );

  // 3 & 4) CERRADOS 30d desde hoja Cerrados
  const cerrados30 = React.useMemo(() => {
    if (!cierreCol) return [];
    return targetC.filter(
      (r) =>
        CLOSED_STATES.has(NORM(r["Estado"])) && withinLastDays(r[cierreCol], 30)
    );
  }, [targetC, cierreCol]);

  const noEvoCerrados30 = React.useMemo(
    () => cerrados30.filter((r) => !isEvo(r)),
    [cerrados30]
  );
  const evoCerrados30 = React.useMemo(
    () => cerrados30.filter((r) => isEvo(r)),
    [cerrados30]
  );

  const noEvoPorAnalista = React.useMemo(
    () => groupCount(noEvoCerrados30, "Agente asignado"),
    [noEvoCerrados30]
  );
  const noEvoPorModulo = React.useMemo(
    () => groupCount(noEvoCerrados30, "Módulo"),
    [noEvoCerrados30]
  );

  const evoPorAnalista = React.useMemo(
    () => groupCount(evoCerrados30, "Agente asignado"),
    [evoCerrados30]
  );
  const evoPorModulo = React.useMemo(
    () => groupCount(evoCerrados30, "Módulo"),
    [evoCerrados30]
  );

  if (!PROG_ID) {
    return (
      <section className="bg-white">
        <div className="mx-auto max-w-7xl p-8">
          <div className="rounded-2xl border-2 border-[#fd006e] p-4 text-[#fd006e]">
            Falta <code>VITE_PROG_SHEET_ID</code>.
          </div>
        </div>
      </section>
    );
  }

  if (!ready) {
    return (
      <section className="bg-white">
        <div className="mx-auto max-w-7xl p-8">
          <div className="rounded-2xl border-2 border-[#398FFF] p-6">
            <div className="text-lg font-semibold text-[#398FFF]">Conectar Google</div>
            <p className="text-sm mt-1">
              Necesito permiso para leer tus hojas <b>Abiertos</b> y{" "}
              <b>Cerrados</b>.
            </p>
            <button
              onClick={connect}
              className="mt-3 px-4 py-2 rounded-xl bg-[#398FFF] text-white"
            >
              Conectar
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-2 text-[#398FFF] mb-4">
          <BarChart2 className="w-5 h-5" />
          <h2 className="text-2xl font-bold">Reportes — últimos 30 días</h2>
        </div>

        {warn && (
          <div className="mb-4 rounded-xl border-2 border-[#fd006e] text-[#fd006e] bg-white px-3 py-2 text-sm">
            {warn}
          </div>
        )}

        {/* KPIs creados */}
        <div className="grid sm:grid-cols-2 gap-6">
          <KpiCard
            title="No evolutivos creados"
            value={loading ? "…" : noEvoCreados30}
            subtitle="Mesas: Beesion, Tenfold, InvGate, SharePoint"
          />
          <KpiCard
            title="Evolutivos creados"
            value={loading ? "…" : evoCreados30}
            subtitle='Tipo = "Pedido de cambio"'
          />
        </div>

        {/* Cerrados por analista/app (no evolutivos) */}
        <div className="mt-8 grid lg:grid-cols-2 gap-6">
          <BucketTable
            title="No evolutivos cerrados por Analista"
            rows={noEvoPorAnalista}
            loading={loading}
            labelA="Analista"
            warnNoCierre={!cierreCol}
          />
          <BucketTable
            title="No evolutivos cerrados por Aplicación"
            rows={noEvoPorModulo}
            loading={loading}
            labelA="Aplicación"
            warnNoCierre={!cierreCol}
          />
        </div>

        {/* Cerrados por analista/app (evolutivos) */}
        <div className="mt-8 grid lg:grid-cols-2 gap-6">
          <BucketTable
            title="Evolutivos cerrados por Analista"
            rows={evoPorAnalista}
            loading={loading}
            labelA="Analista"
          />
          <BucketTable
            title="Evolutivos cerrados por Aplicación"
            rows={evoPorModulo}
            loading={loading}
            labelA="Aplicación"
          />
        </div>
      </div>
    </section>
  );
}

function KpiCard({ title, value, subtitle }) {
  return (
    <div className="rounded-2xl border-2 border-[#398FFF] p-6 bg-white">
      <div className="text-slate-500 text-sm">{title}</div>
      <div className="mt-2 text-5xl font-extrabold">{value}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-2">{subtitle}</div>}
    </div>
  );
}

function BucketTable({ title, rows, loading, labelA, warnNoCierre }) {
  return (
    <div className="rounded-2xl border-2 border-[#398FFF] p-6 bg-white">
      <div className="font-semibold text-[#398FFF]">{title}</div>
      {warnNoCierre && (
        <div className="text-sm text-slate-500 mt-2">Falta mapear una columna de cierre.</div>
      )}
      <div className="mt-3">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-[#E3F2FD]">
              <th className="text-left px-3 py-2">{labelA}</th>
              <th className="text-right px-3 py-2">Cerrados (30d)</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={2} className="px-3 py-3 text-slate-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && (!rows || rows.length === 0) && (
              <tr>
                <td colSpan={2} className="px-3 py-3 text-slate-500">
                  Sin datos
                </td>
              </tr>
            )}
            {!loading &&
              rows?.slice(0, 50).map(({ name, count }) => (
                <tr key={name} className="border-b last:border-0">
                  <td className="px-3 py-2">{name}</td>
                  <td className="px-3 py-2 text-right">{count}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

