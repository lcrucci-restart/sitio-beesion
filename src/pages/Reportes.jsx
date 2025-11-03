import React, { useEffect, useMemo, useState } from "react";
import { hasGoogle, initTokenClient, ensureToken, isSignedIn } from "../lib/googleAuth";
import { BarChart2 } from "lucide-react";
import { readReporteAbiertos, readReporteCerrados } from "../lib/sheets";

/** ================== CONFIG ================== */
const TAB_ABIERTOS = "Reporte Abiertos";
const TAB_CERRADOS = "Reporte Cerrados";

// normalizador
const NORM = (s) =>
  (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

// helper Set normalizado
const S = (...xs) => new Set(xs.map(NORM));

// Vistas según tu normalización final
const VIEWS = [
  { key: "global",     label: "Global",     mesas: null },
  { key: "beesion",    label: "Beesion",    mesas: S("Nivel 1", "Nivel 2", "Nivel 3") },
  { key: "tenfold",    label: "Tenfold",    mesas: S("Tenfold") },
  { key: "invgate",    label: "Invgate",    mesas: S("Invgate") },
  { key: "sharepoint", label: "SharePoint", mesas: S("Sharepoint") },
];

// Columnas EXACTAS en masters normalizadas
const COLS = {
  modulo:        "Módulo",
  agente:        "Agente asignado",
  tipo:          "Tipo",
  mesaAsignada:  "Mesa asignada",
  fecCre:        "Fecha de creación",  // aparece en Abiertos y (ahora) en Cerrados
  fecFin:        "Fecha fin",          // solo para vistas de cerrados por fecha de cierre
};

// evolutivo
const isEvo = (row) => NORM(row?.[COLS.tipo]) === "pedido de cambio";

/** ========= Fechas robustas + límites por día (timezone-safe) ========= */
function parseDateMaybe(v) {
  if (!v) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  const s = String(v).trim().replace(/\s+/g, " ");
  if (!s) return null;

  // yyyy-mm-dd[ T]hh:mm[:ss]
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(s);
  if (m) {
    const y = +m[1], mo = +m[2] - 1, d = +m[3];
    const H = +(m[4] ?? 0), M = +(m[5] ?? 0), S = +(m[6] ?? 0);
    const dt = new Date(y, mo, d, H, M, S, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  // dd/mm/yyyy o dd-mm-yyyy [hh:mm[:ss] [AM|PM]]
  m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM|am|pm)?)?$/.exec(s);
  if (m) {
    const d = +m[1], mo = +m[2] - 1, yy = +m[3]; const y = yy < 100 ? 2000 + yy : yy;
    let H = +(m[4] ?? 0), M = +(m[5] ?? 0), S = +(m[6] ?? 0);
    const ap = (m[7] || "").toUpperCase();
    if (ap === "AM" && H === 12) H = 0;
    if (ap === "PM" && H < 12) H += 12;
    const dt = new Date(y, mo, d, H, M, S, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }

  const dt = new Date(s);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

// trunc a 00:00 local
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0); }
// fin de día 23:59:59.999 local
function endOfDay(d)   { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999); }

// últimos N días (incluye hoy). Si days === "all", no filtra.
function withinLastDays(date, days) {
  if (days === "all") return true;
  const d = parseDateMaybe(date);
  if (!d) return false;
  const now = new Date();
  const from = startOfDay(new Date(now.getTime() - Number(days) * 86400000));
  const to   = endOfDay(now);
  return d >= from && d <= to;
}

/** ========= util de agrupación ========= */
function groupCount(list, col) {
  const map = new Map();
  for (const r of list) {
    const key = (r[col] || "—").toString().trim() || "—";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 50);
}

// filtro por vista (usa mesa asignada ya normalizada)
function filterByView(rows, view, mesaColName = COLS.mesaAsignada) {
  if (!view?.mesas) return rows;
  const allowed = view.mesas;
  return rows.filter((r) => allowed.has(NORM(r?.[mesaColName])));
}

/** ========== UI helpers ========== */
function BarChart({ rows, color = "#398FFF" }) {
  const max = rows.reduce((m, [, c]) => Math.max(m, c), 1);
  return (
    <div className="mt-3 space-y-2">
      {rows.map(([name, count]) => (
        <div key={name}>
          <div className="flex justify-between text-sm">
            <div className="truncate pr-2">{name}</div>
            <div className="text-slate-500">{count}</div>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(count / max) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
      {rows.length === 0 && <div className="text-sm text-slate-500">Sin datos</div>}
    </div>
  );
}

function TableList({ rows, loading, labelA }) {
  return (
    <div className="mt-3">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-[#E3F2FD]">
            <th className="text-left px-3 py-2">{labelA}</th>
            <th className="text-right px-3 py-2">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={2} className="px-3 py-3 text-slate-500">Cargando…</td></tr>}
          {!loading && rows?.length === 0 && <tr><td colSpan={2} className="px-3 py-3 text-slate-500">Sin datos</td></tr>}
          {rows?.map(([name, count]) => (
            <tr key={name} className="border-b last:border-0">
              <td className="px-3 py-2">{name}</td>
              <td className="px-3 py-2 text-right">{count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PanelConToggle({ title, rows, loading, labelA, color = "#398FFF", defaultMode = "chart" }) {
  const [mode, setMode] = useState(defaultMode);
  return (
    <div className="rounded-2xl border-2 border-[#398FFF] p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-[#398FFF]">{title}</div>
        <div className="inline-flex rounded-xl border-2 overflow-hidden border-[#398FFF]">
          <button
            onClick={() => setMode("chart")}
            className={`px-3 py-1.5 text-sm ${mode === "chart" ? "bg-[#398FFF] text-white" : "text-[#398FFF]"}`}
            title="Ver gráfico"
          >
            Gráfico
          </button>
          <button
            onClick={() => setMode("table")}
            className={`px-3 py-1.5 text-sm ${mode === "table" ? "bg-[#398FFF] text-white" : "text-[#398FFF]"}`}
            title="Ver tabla"
          >
            Tabla
          </button>
        </div>
      </div>

      {mode === "chart" ? <BarChart rows={rows} color={color} /> : <TableList rows={rows} loading={loading} labelA={labelA} />}
    </div>
  );
}

/** ================== Página Reportes ================== */
export default function Reportes() {
  const [ready, setReady]     = useState(isSignedIn());
  const [loading, setLoading] = useState(false);
  const [warn, setWarn]       = useState(null);

  const [rowsAbiertos, setRowsAbiertos] = useState([]);
  const [rowsCerrados, setRowsCerrados] = useState([]);

  // estado UI
  const [dataset, setDataset] = useState("abiertos");  // default: abiertos
  const [viewKey, setViewKey] = useState("global");
  const [days, setDays]       = useState(30);          // 30 | 60 | 90 | "all"

  const view = useMemo(() => VIEWS.find(v => v.key === viewKey) || VIEWS[0], [viewKey]);

  useEffect(() => { if (hasGoogle()) initTokenClient(); }, []);
  const connect = async () => { await ensureToken(); setReady(true); };

  // lee ambas pestañas
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!ready) return;
      setLoading(true);
      setWarn(null);
      try {
        const [a, c] = await Promise.all([
          readReporteAbiertos().catch(() => ({ rows: [], headers: [] })),
          readReporteCerrados().catch(() => ({ rows: [], headers: [] })),
        ]);
        if (!alive) return;
        setRowsAbiertos(Array.isArray(a.rows) ? a.rows : []);
        setRowsCerrados(Array.isArray(c.rows) ? c.rows : []);

        // chequear headers mínimos
        const missingA = [];
        const headersA = a?.headers || [];
        if (!headersA.includes(COLS.mesaAsignada)) missingA.push(COLS.mesaAsignada);
        if (!headersA.includes(COLS.modulo))       missingA.push(COLS.modulo);
        if (!headersA.includes(COLS.fecCre))       missingA.push(COLS.fecCre);

        const missingC = [];
        const headersC = c?.headers || [];
        if (!headersC.includes(COLS.mesaAsignada)) missingC.push(COLS.mesaAsignada);
        if (!headersC.includes(COLS.modulo))       missingC.push(COLS.modulo);
        if (!headersC.includes(COLS.fecFin))       missingC.push(COLS.fecFin);
        if (!headersC.includes(COLS.fecCre))       missingC.push(COLS.fecCre); // <- ahora requerida

        const msgs = [];
        if (missingA.length) msgs.push(`"${TAB_ABIERTOS}": faltan ${missingA.join(", ")}`);
        if (missingC.length) msgs.push(`"${TAB_CERRADOS}": faltan ${missingC.join(", ")}`);
        if (msgs.length) setWarn(`Revisá columnas en ${msgs.join(" — ")}`);
      } catch (e) {
        if (alive) setWarn("No pude leer Reporte Abiertos/Cerrados (permisos / env / Google API).");
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [ready]);

  /** ====== Helpers ====== */
  function getFechaFin(row) {
    const f1 = row[COLS.fecFin];
    if (f1 && String(f1).trim()) return f1;
    const f2 = row["Fecha de solución"];
    if (f2 && String(f2).trim()) return f2;
    const f3 = row["Fecha de rechazo"];
    if (f3 && String(f3).trim()) return f3;
    return "";
  }

  // ------ Abiertos: combinar por FECHA DE CREACIÓN (Abiertos + Cerrados) ------
  const abiertosConsolidados = useMemo(() => {
    // traigo creación desde ambas fuentes
    const baseA = rowsAbiertos.map(r => ({ ...r, __src: "A" }));
    const baseC = rowsCerrados.map(r => ({ ...r, __src: "C" })); // Cerrados también trae Fecha de creación (nuevo)
    return [...baseA, ...baseC];
  }, [rowsAbiertos, rowsCerrados]);

  const abiertosFiltrados = useMemo(() => {
    const porVista = filterByView(abiertosConsolidados, view); // usa Mesa asignada
    return porVista.filter((r) => withinLastDays(r[COLS.fecCre], days));
  }, [abiertosConsolidados, viewKey, days]);

  const abiertosNoEvo = useMemo(() => abiertosFiltrados.filter((r) => !isEvo(r)), [abiertosFiltrados]);
  const abiertosEvo   = useMemo(() => abiertosFiltrados.filter((r) =>  isEvo(r)), [abiertosFiltrados]);

  const abiertos_noevo_por_app = useMemo(() => groupCount(abiertosNoEvo, COLS.modulo), [abiertosNoEvo]);
  const abiertos_evo_por_app   = useMemo(() => groupCount(abiertosEvo,   COLS.modulo), [abiertosEvo]);

  // ------ Cerrados: por FECHA FIN (si tu hoja ya viene recortada a 30d, igual soporta 60/90/Todos) ------
  const cerradosFiltrados = useMemo(() => {
    const base = filterByView(rowsCerrados, view);
    return base.filter((r) => withinLastDays(getFechaFin(r), days));
  }, [rowsCerrados, viewKey, days]);

  const cerradosNoEvo = useMemo(() => cerradosFiltrados.filter((r) => !isEvo(r)), [cerradosFiltrados]);
  const cerradosEvo   = useMemo(() => cerradosFiltrados.filter((r) =>  isEvo(r)), [cerradosFiltrados]);

  const cerrados_noevo_por_analista = useMemo(() => groupCount(cerradosNoEvo, "Agente asignado"), [cerradosNoEvo]);
  const cerrados_noevo_por_app      = useMemo(() => groupCount(cerradosNoEvo, COLS.modulo), [cerradosNoEvo]);
  const cerrados_evo_por_analista   = useMemo(() => groupCount(cerradosEvo,   "Agente asignado"), [cerradosEvo]);
  const cerrados_evo_por_app        = useMemo(() => groupCount(cerradosEvo,   COLS.modulo), [cerradosEvo]);

  /** ================== UI ================== */
  if (!ready) {
    return (
      <section className="bg-white">
        <div className="mx-auto max-w-7xl p-8">
          <div className="rounded-2xl border-2 border-[#398FFF] p-6">
            <div className="text-lg font-semibold text-[#398FFF]">Conectar Google</div>
            <p className="text-sm mt-1">Necesito permiso para leer <b>{TAB_ABIERTOS}</b> y <b>{TAB_CERRADOS}</b>.</p>
            <button onClick={async () => { await connect(); }} className="mt-3 px-4 py-2 rounded-xl bg-[#398FFF] text-white">Conectar</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-2 text-[#398FFF] mb-2">
          <BarChart2 className="w-5 h-5" />
          <h2 className="text-2xl font-bold">Reportes — últimos {days === "all" ? "todos" : `${days} días`}</h2>
        </div>

        {/* Diagnóstico */}
        <div className="mb-4 text-sm text-slate-600">
          <div className="flex flex-wrap gap-3">
            <span className="px-2 py-1 rounded border">Abiertos cargados: <b>{rowsAbiertos.length}</b></span>
            <span className="px-2 py-1 rounded border">Cerrados cargados: <b>{rowsCerrados.length}</b></span>
            <span className="px-2 py-1 rounded border">Vista: <b>{VIEWS.find(v=>v.key===viewKey)?.label}</b></span>
            <span className="px-2 py-1 rounded border">Abiertos (creados) filtrados: <b>{abiertosFiltrados.length}</b></span>
            <span className="px-2 py-1 rounded border">Cerrados (por fin) filtrados: <b>{cerradosFiltrados.length}</b></span>
          </div>
        </div>

        {/* Controles */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="inline-flex rounded-xl border-2 overflow-hidden border-[#398FFF]">
            <button
              onClick={()=>setDataset("abiertos")}
              className={`px-3 py-1.5 text-sm ${dataset==="abiertos"?"bg-[#398FFF] text-white":"text-[#398FFF]"}`}
            >Abiertos</button>
            <button
              onClick={()=>setDataset("cerrados")}
              className={`px-3 py-1.5 text-sm ${dataset==="cerrados"?"bg-[#398FFF] text-white":"text-[#398FFF]"}`}
            >Cerrados</button>
          </div>

          <div className="flex flex-wrap gap-2">
            {VIEWS.map(v => (
              <button key={v.key}
                onClick={()=>setViewKey(v.key)}
                className={`px-3 py-1.5 rounded-xl border-2 ${viewKey===v.key ? "bg-[#398FFF] text-white border-[#398FFF]" : "text-[#398FFF] border-[#398FFF]"}`}>
                {v.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-600">Rango:</label>
            <select
              value={String(days)}
              onChange={(e)=> setDays(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="border rounded-lg px-2 py-1 text-sm"
            >
              <option value="30">30 días</option>
              <option value="60">60 días</option>
              <option value="90">90 días</option>
              <option value="all">Todos</option>
            </select>
          </div>
        </div>

        {/* ================== BLOQUES ================== */}
        {dataset === "abiertos" ? (
          <>
            {/* SOLO dos tarjetas por Aplicación, como pediste */}
            <div className="grid lg:grid-cols-2 gap-6">
              <PanelConToggle
                title={`Abiertos (no evolutivos) por Aplicación — ${VIEWS.find(v=>v.key===viewKey)?.label || ""}`}
                rows={abiertos_noevo_por_app}
                loading={loading}
                labelA="Aplicación"
                color="#398FFF"
                defaultMode="chart"
              />
              <PanelConToggle
                title={`Abiertos (evolutivos) por Aplicación — ${VIEWS.find(v=>v.key===viewKey)?.label || ""}`}
                rows={abiertos_evo_por_app}
                loading={loading}
                labelA="Aplicación"
                color="#fd006e"
                defaultMode="chart"
              />
            </div>
          </>
        ) : (
          <>
            {/* Cerrados (dejamos tus cuatro vistas) */}
            <div className="grid lg:grid-cols-2 gap-6">
              <PanelConToggle
                title={`No evolutivos cerrados por Analista — ${VIEWS.find(v=>v.key===viewKey)?.label || ""}`}
                rows={cerrados_noevo_por_analista}
                loading={loading}
                labelA="Analista"
                color="#398FFF"
                defaultMode="chart"
              />
              <PanelConToggle
                title={`No evolutivos cerrados por Aplicación — ${VIEWS.find(v=>v.key===viewKey)?.label || ""}`}
                rows={cerrados_noevo_por_app}
                loading={loading}
                labelA="Aplicación"
                color="#398FFF"
                defaultMode="chart"
              />
            </div>

            <div className="mt-8 grid lg:grid-cols-2 gap-6">
              <PanelConToggle
                title={`Evolutivos cerrados por Analista — ${VIEWS.find(v=>v.key===viewKey)?.label || ""}`}
                rows={cerrados_evo_por_analista}
                loading={loading}
                labelA="Analista"
                color="#fd006e"
                defaultMode="chart"
              />
              <PanelConToggle
                title={`Evolutivos cerrados por Aplicación — ${VIEWS.find(v=>v.key===viewKey)?.label || ""}`}
                rows={cerrados_evo_por_app}
                loading={loading}
                labelA="Aplicación"
                color="#fd006e"
                defaultMode="chart"
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
