// src/pages/Reportes.jsx
import React, { useEffect, useMemo, useState } from "react";
import { hasGoogle, initTokenClient, ensureToken, isSignedIn } from "../lib/googleAuth";
import { readTable } from "../lib/sheets";
import { BarChart2 } from "lucide-react";
import { readReporteAbiertos, readReporteCerrados } from "../lib/sheets";

/** ================== CONFIG ================== */

// Pestañas nuevas donde volcás los exports de InvGate
const TAB_ABIERTOS = "Reporte Abiertos";
const TAB_CERRADOS = "Reporte Cerrados";

// Vistas pedidas (podés ajustar las mesas de cada vendor acá)
const VIEWS = [
  { key: "global",    label: "Global",    mesas: null }, // sin filtro = todas
  { key: "beesion",   label: "Beesion",   mesas: new Set(["nivel 1","nivel 2","nivel 3","product","catu","ing red"]) },
  { key: "tenfold",   label: "Tenfold",   mesas: new Set(["tenfold nivel 1"]) },
  { key: "invgate",   label: "InvGate",   mesas: new Set(["invgate nivel 1"]) },
  { key: "sharepoint",label: "SharePoint",mesas: new Set(["sharepoint nivel 1"]) },
];

// Nombres de columnas exactos según tus CSV
const COLS = {
  // comunes
  modulo: "Categoría",          // (antes "Módulo")
  agente: "Agente asignado",
  tipo:   "Tipo",
  // abiertos
  mesaAbiertos: "Mesa de ayuda", 
  fecCre: "Fecha de creación",
  // cerrados
  mesaCerrados: "Mesa de ayuda", // en tu export también es "Mesa de ayuda"
  estado: "Estado",              // si el CSV de cerrados no trae "Estado", no lo uses en el filtro
  fecFin: "Fecha de cierre",
  fecSol: "Fecha de solución",
  fecRech:"Fecha de rechazo",
};

// normalizador de strings
const NORM = (s) =>
  (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

// Tipo evolutivo
const isEvo = (row) => NORM(row?.[COLS.tipo]) === "pedido de cambio";

const [a, c] = await Promise.all([
  readReporteAbiertos().catch(() => ({ rows: [], headers: [] })),
  readReporteCerrados().catch(() => ({ rows: [], headers: [] })),
]);

// Estados que significan “cerrado/cancelado/rechazado/resuelto” (cubre variantes)
function isClosedState(v) {
  const n = NORM(v);
  return /(cerrad|cancelad|rechazad|resuelt)/.test(n);
}

// parseo de fechas flexible
function parseDateMaybe(v) {
  if (v instanceof Date) return v;
  const s = (v || "").toString().trim();
  if (!s) return null;

  // dd/mm/yyyy [HH:MM]
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(s);
  if (m) {
    const d = +m[1], mo = +m[2] - 1, yy = +m[3]; const y = yy < 100 ? 2000 + yy : yy;
    const H = +m[4] || 0, M = +m[5] || 0;
    const dt = new Date(y, mo, d, H, M, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const d2 = new Date(s);
  return Number.isNaN(d2.getTime()) ? null : d2;
}

function withinLastDays(date, days) {
  const d = parseDateMaybe(date);
  if (!d) return false;
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return d >= from && d <= now;
}

// group by cuenta
function groupCount(list, col) {
  const map = new Map();
  for (const r of list) {
    const key = (r[col] || "—").toString().trim() || "—";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 50);
}

// aplica filtro por VISTA (mesas)
function filterByView(rows, view, mesaColName) {
  if (!view?.mesas) return rows; // global
  const allowed = view.mesas;
  return rows.filter((r) => allowed.has(NORM(r[mesaColName])));
}

/** ========== Componentes gráficos ligeros ========== */
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
            <th className="text-right px-3 py-2">Cantidad (30d)</th>
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
  const [mode, setMode] = useState(defaultMode); // "chart" | "table"
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

      {mode === "chart"
        ? <BarChart rows={rows} color={color} />
        : <TableList rows={rows} loading={loading} labelA={labelA} />
      }
    </div>
  );
}

/** ================== Página Reportes ================== */
export default function Reportes() {
  const [ready, setReady]   = useState(isSignedIn());
  const [loading, setLoading] = useState(false);
  const [warn, setWarn]     = useState(null);

  const [rowsAbiertos, setRowsAbiertos] = useState([]);
  const [rowsCerrados, setRowsCerrados] = useState([]);

  // selección de dataset (Abiertos / Cerrados) y View (Global / Beesion / Tenfold / InvGate / SharePoint)
  const [dataset, setDataset] = useState("cerrados"); // "cerrados" | "abiertos"
  const [viewKey, setViewKey] = useState("beesion");  // default Beesion
  const view = useMemo(() => VIEWS.find(v => v.key === viewKey) || VIEWS[0], [viewKey]);

  useEffect(() => { if (hasGoogle()) initTokenClient(); }, []);
  const connect = async () => { await ensureToken(); setReady(true); };

  // carga de ambas pestañas nuevas
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!ready) return;
      setLoading(true);
      setWarn(null);
      try {
        const [a, c] = await Promise.all([
          readTable(TAB_ABIERTOS).catch(() => ({ rows: [], headers: [] })),
          readTable(TAB_CERRADOS).catch(() => ({ rows: [], headers: [] })),
        ]);
        if (!alive) return;
        setRowsAbiertos(Array.isArray(a.rows) ? a.rows : []);
        setRowsCerrados(Array.isArray(c.rows) ? c.rows : []);

        // Aviso si faltan columnas clave en Cerrados
        const missingC = [];
        const headersC = c?.headers || [];
        if (!headersC.includes(COLS.estado)) missingC.push(COLS.estado);
        if (!(headersC.includes(COLS.fecFin) || headersC.includes(COLS.fecSol) || headersC.includes(COLS.fecRech))) {
          missingC.push(`${COLS.fecFin} (o ${COLS.fecSol}/${COLS.fecRech})`);
        }
        if (missingC.length) {
          setWarn(`Revisá columnas en "${TAB_CERRADOS}": faltan ${missingC.join(", ")}`);
        }
      } catch (e) {
        if (alive) setWarn("No pude leer Reporte Abiertos/Cerrados (permisos / env / Google API).");
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [ready]);

  /** ====== Helpers específicos ====== */

  // Fecha fin robusta (Cerrados): usa Fecha fin; si no hay, prueba solución o rechazo
  function getFechaFin(row) {
    const f1 = row[COLS.fecFin];
    if (f1 && String(f1).trim()) return f1;
    const f2 = row[COLS.fecSol];
    if (f2 && String(f2).trim()) return f2;
    const f3 = row[COLS.fecRech];
    if (f3 && String(f3).trim()) return f3;
    return "";
  }

  // ====== Dataset: CERRADOS ======
const cerradosFiltrados = useMemo(() => {
  const base = filterByView(rowsCerrados, view, COLS.mesaCerrados);
  // Solo fecha (últimos 30 días), sin depender de "Estado":
  return base.filter((r) => withinLastDays(getFechaFin(r), 30));
}, [rowsCerrados, viewKey]);

  const cerradosNoEvo = useMemo(() => cerradosFiltrados.filter((r) => !isEvo(r)), [cerradosFiltrados]);
  const cerradosEvo   = useMemo(() => cerradosFiltrados.filter((r) =>  isEvo(r)), [cerradosFiltrados]);

  const cerrados_noevo_por_analista = useMemo(
    () => groupCount(cerradosNoEvo, COLS.agente), [cerradosNoEvo]
  );
  const cerrados_noevo_por_app = useMemo(
    () => groupCount(cerradosNoEvo, COLS.modulo), [cerradosNoEvo]
  );
  const cerrados_evo_por_analista = useMemo(
    () => groupCount(cerradosEvo, COLS.agente), [cerradosEvo]
  );
  const cerrados_evo_por_app = useMemo(
    () => groupCount(cerradosEvo, COLS.modulo), [cerradosEvo]
  );

  // ====== Dataset: ABIERTOS ======
  const abiertosFiltrados = useMemo(() => {
    // mesa = Mesa (en Abiertos)
    const base = filterByView(rowsAbiertos, view, COLS.mesaAbiertos);
    return base.filter((r) => withinLastDays(r[COLS.fecCre], 30));
  }, [rowsAbiertos, viewKey]);

  const abiertosNoEvo = useMemo(() => abiertosFiltrados.filter((r) => !isEvo(r)), [abiertosFiltrados]);
  const abiertosEvo   = useMemo(() => abiertosFiltrados.filter((r) =>  isEvo(r)), [abiertosFiltrados]);

  const abiertos_noevo_por_app = useMemo(
    () => groupCount(abiertosNoEvo, COLS.modulo), [abiertosNoEvo]
  );
  const abiertos_evo_por_app = useMemo(
    () => groupCount(abiertosEvo, COLS.modulo), [abiertosEvo]
  );
  const abiertos_noevo_por_analista = useMemo(
    () => groupCount(abiertosNoEvo, COLS.agente), [abiertosNoEvo]
  );
  const abiertos_evo_por_analista = useMemo(
    () => groupCount(abiertosEvo, COLS.agente), [abiertosEvo]
  );

  /** ================== UI ================== */

  if (!ready) {
    return (
      <section className="bg-white">
        <div className="mx-auto max-w-7xl p-8">
          <div className="rounded-2xl border-2 border-[#398FFF] p-6">
            <div className="text-lg font-semibold text-[#398FFF]">Conectar Google</div>
            <p className="text-sm mt-1">Necesito permiso para leer <b>{TAB_ABIERTOS}</b> y <b>{TAB_CERRADOS}</b>.</p>
            <button onClick={connect} className="mt-3 px-4 py-2 rounded-xl bg-[#398FFF] text-white">Conectar</button>
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

        {/* Top controls: dataset + view */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="inline-flex rounded-xl border-2 overflow-hidden border-[#398FFF]">
            <button
              onClick={()=>setDataset("cerrados")}
              className={`px-3 py-1.5 text-sm ${dataset==="cerrados"?"bg-[#398FFF] text-white":"text-[#398FFF]"}`}
              title="Ver vistas de Cerrados"
            >Cerrados</button>
            <button
              onClick={()=>setDataset("abiertos")}
              className={`px-3 py-1.5 text-sm ${dataset==="abiertos"?"bg-[#398FFF] text-white":"text-[#398FFF]"}`}
              title="Ver vistas de Abiertos"
            >Abiertos</button>
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
        </div>

        {warn && (
          <div className="mb-4 rounded-xl border-2 border-[#fd006e] text-[#fd006e] bg-white px-3 py-2 text-sm">
            {warn}
          </div>
        )}

        {/* ================== BLOQUES ================== */}
        {dataset === "cerrados" ? (
          <>
            {/* Cerrados No Evolutivos */}
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

            {/* Cerrados Evolutivos */}
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
        ) : (
          <>
            {/* Abiertos No Evolutivos */}
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
                title={`Abiertos (no evolutivos) por Analista — ${VIEWS.find(v=>v.key===viewKey)?.label || ""}`}
                rows={abiertos_noevo_por_analista}
                loading={loading}
                labelA="Analista"
                color="#398FFF"
                defaultMode="table"
              />
            </div>

            {/* Abiertos Evolutivos */}
            <div className="mt-8 grid lg:grid-cols-2 gap-6">
              <PanelConToggle
                title={`Abiertos (evolutivos) por Aplicación — ${VIEWS.find(v=>v.key===viewKey)?.label || ""}`}
                rows={abiertos_evo_por_app}
                loading={loading}
                labelA="Aplicación"
                color="#fd006e"
                defaultMode="chart"
              />
              <PanelConToggle
                title={`Abiertos (evolutivos) por Analista — ${VIEWS.find(v=>v.key===viewKey)?.label || ""}`}
                rows={abiertos_evo_por_analista}
                loading={loading}
                labelA="Analista"
                color="#fd006e"
                defaultMode="table"
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
