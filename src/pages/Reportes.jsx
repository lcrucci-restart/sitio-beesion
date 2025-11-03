// src/pages/Reportes.jsx
import React, { useEffect, useMemo, useState } from "react";
import { hasGoogle, initTokenClient, ensureToken, isSignedIn } from "../lib/googleAuth";
import { BarChart2 } from "lucide-react";
import { readReporteAbiertos, readReporteCerrados } from "../lib/sheets";

/** ================== CONFIG ================== */

// Pestañas master normalizadas en tu Sheet
const TAB_ABIERTOS = "Reporte Abiertos";
const TAB_CERRADOS = "Reporte Cerrados";

// Vistas (vendor/mesas) ya normalizadas en tu master
const VIEWS = [
  { key: "global",  label: "Global",  mesas: null },
  { key: "n1",      label: "Nivel 1", mesas: new Set(["nivel 1"]) },
  { key: "n2",      label: "Nivel 2", mesas: new Set(["nivel 2"]) },
  { key: "n3",      label: "Nivel 3", mesas: new Set(["nivel 3"]) },
  { key: "tenfold", label: "Tenfold", mesas: new Set(["tenfold"]) },
  { key: "invgate", label: "InvGate", mesas: new Set(["invgate"]) },
  { key: "sp",      label: "SharePoint", mesas: new Set(["sharepoint"]) },
];

// Columnas EXACTAS en las masters normalizadas
const COLS = {
  nro:          "Nro",
  modulo:       "Módulo",
  agente:       "Agente asignado",
  tipo:         "Tipo",
  mesaAsignada: "Mesa asignada",
  fecCre:       "Fecha de creación",
  fecFin:       "Fecha fin",
};

// normalizador leve (para comparar mesas)
const NORM = (s) =>
  (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

// evolutivo?
const isEvo = (row) => NORM(row?.[COLS.tipo]) === "pedido de cambio";

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

// ¿fecha dentro del rango “últimos N días”?
function withinLastDays(date, days) {
  if (!date) return false;
  if (days === "all") return true;
  const d = parseDateMaybe(date);
  if (!d) return false;
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return d >= from && d <= now;
}

// group by con conteo
function groupCount(list, col) {
  const map = new Map();
  for (const r of list) {
    const key = (r[col] || "—").toString().trim() || "—";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 50);
}

// filtro por vista (mesas)
function filterByView(rows, view, mesaColName = COLS.mesaAsignada) {
  if (!view?.mesas) return rows; // Global
  const allowed = view.mesas;
  return rows.filter((r) => allowed.has(NORM(r[mesaColName])));
}

// dedupe por Nro (conserva la fila “más nueva” por Fecha de creación si ambas existen)
function dedupeByNroPreferNewerCreation(rows) {
  const best = new Map(); // nro -> row
  for (const r of rows) {
    const k = (r[COLS.nro] ?? "").toString().trim();
    if (!k) continue;
    const cur = best.get(k);
    if (!cur) { best.set(k, r); continue; }
    // si ambos tienen fecCre, elegimos el más nuevo
    const a = parseDateMaybe(cur[COLS.fecCre]);
    const b = parseDateMaybe(r[COLS.fecCre]);
    if (a && b) {
      if (b.getTime() >= a.getTime()) best.set(k, r);
    } else if (b && !a) {
      best.set(k, r);
    }
  }
  return Array.from(best.values());
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

      {mode === "chart"
        ? <BarChart rows={rows} color={color} />
        : <TableList rows={rows} loading={loading} labelA={labelA} />
      }
    </div>
  );
}

/** ================== Página Reportes ================== */
export default function Reportes() {
  const [ready, setReady] = useState(isSignedIn());
  const [loading, setLoading] = useState(false);
  const [warn, setWarn] = useState(null);

  const [rowsAbiertos, setRowsAbiertos] = useState([]);
  const [rowsCerrados, setRowsCerrados] = useState([]);

  // dataset y vista
  const [dataset, setDataset] = useState("cerrados"); // "cerrados" | "abiertos"
  const [viewKey, setViewKey] = useState("global");
  const view = useMemo(() => VIEWS.find(v => v.key === viewKey) || VIEWS[0], [viewKey]);

  // filtro de rango
  const [range, setRange] = useState(30); // 30 | 60 | 90 | "all"

  useEffect(() => { if (hasGoogle()) initTokenClient(); }, []);
  const connect = async () => { await ensureToken(); setReady(true); };

  // carga de ambas pestañas master normalizadas
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

        const ra = Array.isArray(a.rows) ? a.rows : [];
        const rc = Array.isArray(c.rows) ? c.rows : [];

        console.log(`[Reportes] Abiertos cargados: ${ra.length}`);
        console.log(`[Reportes] Cerrados cargados: ${rc.length}`);

        setRowsAbiertos(ra);
        setRowsCerrados(rc);

        // Avisos mínimos
        const missingA = [];
        const hA = a?.headers || [];
        if (!hA.includes(COLS.mesaAsignada)) missingA.push(COLS.mesaAsignada);
        if (!hA.includes(COLS.modulo))       missingA.push(COLS.modulo);
        if (!hA.includes(COLS.fecCre))       missingA.push(COLS.fecCre);

        const missingC = [];
        const hC = c?.headers || [];
        if (!hC.includes(COLS.mesaAsignada)) missingC.push(COLS.mesaAsignada);
        if (!hC.includes(COLS.modulo))       missingC.push(COLS.modulo);
        if (!hC.includes(COLS.fecFin))       missingC.push(COLS.fecFin);
        // Nota: fecCre en RC puede faltar (lo completaremos por GAS fallback si hace falta)

        const msgs = [];
        if (missingA.length) msgs.push(`"${TAB_ABIERTOS}": faltan ${missingA.join(", ")}`);
        if (missingC.length) msgs.push(`"${TAB_CERRADOS}": faltan ${missingC.join(", ")}`);
        if (msgs.length) setWarn(`Revisá columnas en ${msgs.join(" — ")}`);
      } catch (e) {
        setWarn("No pude leer Reporte Abiertos/Cerrados (permisos / env / Google API).");
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [ready]);

  /** ====== Helpers específicos ====== */

  // Fecha fin robusta (Cerrados): en tu master ya viene "Fecha fin"
  function getFechaFin(row) {
    const f1 = row[COLS.fecFin];
    if (f1 && String(f1).trim()) return f1;
    // fallback defensivo
    const f2 = row["Fecha de solución"];
    if (f2 && String(f2).trim()) return f2;
    const f3 = row["Fecha de rechazo"];
    if (f3 && String(f3).trim()) return f3;
    return "";
  }

  // ====== Dataset: CERRADOS ======
  const cerradosFiltrados = useMemo(() => {
    const base = filterByView(rowsCerrados, view);
    const out = base.filter((r) => withinLastDays(getFechaFin(r), range === "all" ? "all" : range));
    console.log(`[Reportes] Cerrados filtrados: ${out.length} (rango=${range}) vista=${view.label}`);
    return out;
  }, [rowsCerrados, viewKey, range]);

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
  // Unión: RA (siempre) + RC (solo filas con Fecha de creación presente), dedupe por Nro, filtra por fecCre
  const abiertosFiltrados = useMemo(() => {
    const baseA = filterByView(rowsAbiertos, view);
    const baseC = filterByView(rowsCerrados, view)
      .filter(r => r[COLS.fecCre] && String(r[COLS.fecCre]).trim()); // solo si RC trae fecCre

    // Unión + dedupe por Nro (prefiere fila con fecCre más nueva)
    const union = dedupeByNroPreferNewerCreation([...baseA, ...baseC]);

    const out = union.filter(r => withinLastDays(r[COLS.fecCre], range === "all" ? "all" : range));
    console.log(`[Reportes] Abiertos filtrados: ${out.length} (rango=${range}) vista=${view.label}`);
    return out;
  }, [rowsAbiertos, rowsCerrados, viewKey, range]);

  const abiertosNoEvo = useMemo(() => abiertosFiltrados.filter((r) => !isEvo(r)), [abiertosFiltrados]);
  const abiertosEvo   = useMemo(() => abiertosFiltrados.filter((r) =>  isEvo(r)), [abiertosFiltrados]);

  const abiertos_noevo_por_app = useMemo(
    () => groupCount(abiertosNoEvo, COLS.modulo), [abiertosNoEvo]
  );
  const abiertos_evo_por_app = useMemo(
    () => groupCount(abiertosEvo, COLS.modulo), [abiertosEvo]
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
          <h2 className="text-2xl font-bold">Reportes — últimos {range === "all" ? "Todos" : `${range} días`}</h2>
        </div>

        {/* Top controls: dataset + view + range */}
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

          <div className="inline-flex rounded-xl border-2 overflow-hidden border-[#398FFF]">
            {[30,60,90,"all"].map(opt => (
              <button key={String(opt)}
                onClick={()=>setRange(opt)}
                className={`px-3 py-1.5 text-sm ${range===opt ? "bg-[#398FFF] text-white":"text-[#398FFF]"}`}>
                {opt==="all" ? "Todos" : `${opt}d`}
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
        ) : (
          <>
            {/* SOLO dos paneles para Abiertos */}
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
        )}
      </div>
    </section>
  );
}
