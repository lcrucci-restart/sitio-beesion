// src/pages/Reportes.jsx
import React, { useEffect, useMemo, useState } from "react";
import { hasGoogle, initTokenClient, ensureToken, isSignedIn } from "../lib/googleAuth";
import { BarChart2 } from "lucide-react";
import { readReporteAbiertos, readReporteCerrados } from "../lib/sheets";

/** ================== CONFIG ================== */

// Masters normalizados
const TAB_ABIERTOS = "Reporte Abiertos";
const TAB_CERRADOS = "Reporte Cerrados";

const VIEWS = [
  { key: "global",    label: "Global",    project: null },
  { key: "beesion",   label: "Beesion",   project: "beesion" },
  { key: "tenfold",   label: "Tenfold",   project: "tenfold" },
  { key: "invgate",   label: "InvGate",   project: "invgate" },
  { key: "sharepoint",label: "SharePoint",project: "sharepoint" },
];



// Columnas exactas
const COLS = {
  modulo:       "Módulo",
  agente:       "Agente asignado",
  tipo:         "Tipo",
  mesaAsignada: "Mesa asignada",
  fecCre:       "Fecha de creación", // Abiertos (tu sheet ya trae 30d)
  fecFin:       "Fecha fin",         // Cerrados
};

// normalizador
const NORM = (s) =>
  (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

// Evolutivo
const isEvo = (row) => NORM(row?.[COLS.tipo]) === "pedido de cambio";

// fecha → Date
function parseDateMaybe(v) {
  if (v instanceof Date) return v;
  const s = (v || "").toString().trim();
  if (!s) return null;
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

function projectFromMesa(raw) {
  const norm = NORM(raw);

  if (norm.includes("beesion"))   return "beesion";
  if (norm.includes("tenfold"))   return "tenfold";
  if (norm.includes("invgate"))   return "invgate";
  if (norm.includes("sharepoint"))return "sharepoint";

  // otros proyectos (si querés distinguirlos)
  if (norm.includes("catu"))      return "catu";
  if (norm.includes("ing_red") || norm.includes("ing red")) return "ing_red";

  return "otros";
}

function mesaNormalizadaFront(raw) {
  const norm = NORM(raw);

  // Casos BEESION
  if (norm.includes("beesion")) {
    if (norm.includes("nivel product")) return "Product";
    if (norm.includes("nivel 1"))       return "Nivel 1";
    if (norm.includes("nivel 2"))       return "Nivel 2";
    if (norm.includes("nivel 3"))       return "Nivel 3";
  }

  // Otros según tu diccionario
  if (norm.includes("catu"))                  return "CATU";
  if (norm.includes("ing_red") || norm.includes("ing red")) return "Ing Red";
  if (norm.includes("tenfold"))               return "Tenfold";
  if (norm.includes("invgate"))               return "Invgate";

  // Fallback: devolvés lo que vino
  return (raw ?? "").toString().trim();
}


// dentro de últimos N días
function withinLastDays(date, days) {
  const d = parseDateMaybe(date);
  if (!d) return false;
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return d >= from && d <= now;
}

// group by columna
function groupCount(list, col) {
  const map = new Map();
  for (const r of list) {
    const key = (r[col] || "—").toString().trim() || "—";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 50);
}

// dd/mm/yyyy
function fmtDDMMYYYY(d) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// group por fecha (dd/mm/yyyy)
function groupCountByDate(list, dateCol) {
  const map = new Map();
  for (const r of list) {
    const d = parseDateMaybe(r[dateCol]);
    if (!d) continue;
    const k = fmtDDMMYYYY(d);
    map.set(k, (map.get(k) || 0) + 1);
  }
  // ordenar por fecha asc
  return Array.from(map.entries())
    .sort((a, b) => {
      const pa = a[0].split("/").reverse().join("-");
      const pb = b[0].split("/").reverse().join("-");
      return pa < pb ? -1 : pa > pb ? 1 : 0;
    });
}

// filtro por vista
function filterByView(rows, view, mesaColName = COLS.mesaAsignada) {
  if (!view || !view.project) return rows; // Global o sin proyecto → todo

  return rows.filter((r) => {
    const proj = projectFromMesa(r[mesaColName]);
    return proj === view.project;
  });
}



/** ========== Gráficos ========== */
// Barras verticales responsivas con scroll horizontal si hay muchas barras
function VerticalBarChart({
  rows,
  color = "#398FFF",
  height = 220,
  showValues = true
}) {
  const n = rows.length;
  // ancho de barra adaptativo (más barras => más angostas), clamp [6..32]
  const barW = Math.max(6, Math.min(32, Math.floor(480 / Math.max(1, Math.sqrt(n)))));
  const gap = 10;
  // ancho mínimo interno para permitir scroll si no entra
  const minInner = n * (barW + gap);

  const rotateLabels = n > 18;

  const max = rows.reduce((m, [, c]) => Math.max(m, c), 1);

  return (
    <div className="mt-3 overflow-x-auto">
      <div
        className="flex items-end"
        style={{ height, minWidth: Math.max(minInner, 320), gap: `${gap}px` }}
      >
        {rows.map(([name, count]) => {
          const h = Math.round((count / max) * (height - 36)); // headroom para labels
          return (
            <div key={name} className="flex flex-col items-center">
              <div
                className="rounded-t"
                style={{ width: barW, height: h, background: color }}
                title={`${name}: ${count}`}
              />
              {showValues && <div className="text-[10px] mt-1 leading-none">{count}</div>}
              <div
                className={`text-[10px] mt-1 leading-tight w-[80px] ${rotateLabels ? "origin-top-left -rotate-45 translate-y-2" : "truncate text-center w-[72px]"}`}
                title={name}
                style={{ whiteSpace: rotateLabels ? "nowrap" : "nowrap" }}
              >
                {name}
              </div>
            </div>
          );
        })}
      </div>
      {rows.length === 0 && <div className="text-sm text-slate-500">Sin datos</div>}
    </div>
  );
}

function TableList({ rows, loading, labelA, labelB = "Cantidad" }) {
  return (
    <div className="mt-3">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-[#E3F2FD]">
            <th className="text-left px-3 py-2">{labelA}</th>
            <th className="text-right px-3 py-2">{labelB}</th>
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

// Panel con toggle Chart/Tabla
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
        ? <VerticalBarChart rows={rows} color={color} />
        : <TableList rows={rows} loading={loading} labelA={labelA} />
      }
    </div>
  );
}

// Panel dual: toggle interno entre "Analista" y "Aplicación" (unificado)
function PanelDual({
  title,
  rowsA, rowsB,
  loading,
  labelA = "Analista",
  labelB = "Aplicación",
  colorA="#398FFF",
  colorB="#398FFF"
}) {
  const [tab, setTab] = useState("A"); // "A" (analista) | "B" (aplicación)
  const rows = tab === "A" ? rowsA : rowsB;
  const color = tab === "A" ? colorA : colorB;

  return (
    <div className="rounded-2xl border-2 border-[#398FFF] p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-[#398FFF]">{title}</div>
        <div className="inline-flex rounded-xl border-2 overflow-hidden border-[#398FFF]">
          <button
            onClick={() => setTab("A")}
            className={`px-3 py-1.5 text-sm ${tab === "A" ? "bg-[#398FFF] text-white" : "text-[#398FFF]"}`}
          >
            {labelA}
          </button>
          <button
            onClick={() => setTab("B")}
            className={`px-3 py-1.5 text-sm ${tab === "B" ? "bg-[#398FFF] text-white" : "text-[#398FFF]"}`}
          >
            {labelB}
          </button>
        </div>
      </div>

      <div className="mt-3" />
      <VerticalBarChart rows={rows} color={color} />
      <TableList rows={rows} loading={loading} labelA={tab === "A" ? labelA : labelB} />
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

  // estado UI
  const [dataset, setDataset] = useState("cerrados"); // "cerrados" | "abiertos"
  const [viewKey, setViewKey] = useState("beesion");
  const view = useMemo(() => VIEWS.find(v => v.key === viewKey) || VIEWS[0], [viewKey]);

  useEffect(() => { if (hasGoogle()) initTokenClient(); }, []);
  const connect = async () => { await ensureToken(); setReady(true); };

  // Carga de datos
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

        // avisos mínimos
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

  /** ====== Transformaciones ====== */

  // --- ABIERTOS ---
  // en lugar de asumir que viene 30d:
  const abiertosByView = useMemo(() => filterByView(rowsAbiertos, view), [rowsAbiertos, viewKey]);

  const abiertosAll30d = useMemo(
    () => abiertosByView.filter(r => withinLastDays(r[COLS.fecCre], 30)),
    [abiertosByView]
  );

  const abiertosNoEvo = useMemo(() => abiertosAll30d.filter((r) => !isEvo(r)), [abiertosAll30d]);
  const abiertosEvo   = useMemo(() => abiertosAll30d.filter((r) =>  isEvo(r)), [abiertosAll30d]);

  const abiertos_noevo_por_app = useMemo(() => groupCount(abiertosNoEvo, COLS.modulo), [abiertosNoEvo]);
  const abiertos_evo_por_app   = useMemo(() => groupCount(abiertosEvo,   COLS.modulo), [abiertosEvo]);

  const abiertos_por_fecha     = useMemo(() => groupCountByDate(abiertosAll30d, COLS.fecCre), [abiertosAll30d]);

  // --- CERRADOS ---
  function getFechaFin(row) {
    return row[COLS.fecFin] || "";
  }

  const cerradosByView = useMemo(() => filterByView(rowsCerrados, view), [rowsCerrados, viewKey]);
  const cerrados30d = useMemo(() => cerradosByView.filter((r) => withinLastDays(getFechaFin(r), 30)), [cerradosByView]);

  const cerradosNoEvo = useMemo(() => cerrados30d.filter((r) => !isEvo(r)), [cerrados30d]);
  const cerradosEvo   = useMemo(() => cerrados30d.filter((r) =>  isEvo(r)), [cerrados30d]);

  const cerrados_noevo_por_analista = useMemo(() => groupCount(cerradosNoEvo, COLS.agente), [cerradosNoEvo]);
  const cerrados_noevo_por_app      = useMemo(() => groupCount(cerradosNoEvo, COLS.modulo), [cerradosNoEvo]);

  const cerrados_evo_por_analista   = useMemo(() => groupCount(cerradosEvo,   COLS.agente), [cerradosEvo]);
  const cerrados_evo_por_app        = useMemo(() => groupCount(cerradosEvo,   COLS.modulo), [cerradosEvo]);

  /** ================== UI ================== */

  if (!ready) {
    return (
      <section className="bg-white">
        <div className="mx-auto max-w-7xl p-8">
          <div className="rounded-2xl border-2 border-[#398FFF] p-6">
            <div className="text-lg font-semibold text-[#398FFF]">Conectar Google</div>
            <p className="text-sm mt-1">
              Necesito permiso para leer <b>{TAB_ABIERTOS}</b> y <b>{TAB_CERRADOS}</b>.
            </p>
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

        {/* Controles */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div className="inline-flex rounded-xl border-2 overflow-hidden border-[#398FFF]">
            <button
              onClick={()=>setDataset("cerrados")}
              className={`px-3 py-1.5 text-sm ${dataset==="cerrados"?"bg-[#398FFF] text-white":"text-[#398FFF]"}`}
              title="Ver Cerrados (30d por Fecha fin)"
            >Cerrados</button>
            <button
              onClick={()=>setDataset("abiertos")}
              className={`px-3 py-1.5 text-sm ${dataset==="abiertos"?"bg-[#398FFF] text-white":"text-[#398FFF]"}`}
              title="Ver Abiertos (30d por Fecha de creación)"
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

        {/* Info */}
        <div className="text-sm text-slate-600 mb-6">
          {dataset === "abiertos" ? (
            <>
              <b>Abiertos cargados:</b> {rowsAbiertos.length} &nbsp;|&nbsp; <b>Vista:</b> {VIEWS.find(v=>v.key===viewKey)?.label ?? "Global"} &nbsp;|&nbsp; <b>Abiertos (vista, 30d ya en origen):</b> {abiertosAll30d.length}
            </>
          ) : (
            <>
              <b>Cerrados cargados:</b> {rowsCerrados.length} &nbsp;|&nbsp; <b>Vista:</b> {VIEWS.find(v=>v.key===viewKey)?.label ?? "Global"} &nbsp;|&nbsp; <b>Cerrados filtrados (30d):</b> {cerrados30d.length}
            </>
          )}
        </div>

        {/* ================== BLOQUES ================== */}
        {dataset === "cerrados" ? (
          <>
            {/* Apilados a lo ancho completo */}
            <div className="space-y-8">
              <PanelDual
                title={`Cerrados NO evolutivos — ${VIEWS.find(v=>v.key===viewKey)?.label || ""}`}
                rowsA={cerrados_noevo_por_analista}
                rowsB={cerrados_noevo_por_app}
                loading={loading}
                labelA="Analista"
                labelB="Aplicación"
                colorA="#398FFF"
                colorB="#398FFF"
              />
              <PanelDual
                title={`Cerrados EVOLUTIVOS — ${VIEWS.find(v=>v.key===viewKey)?.label || ""}`}
                rowsA={cerrados_evo_por_analista}
                rowsB={cerrados_evo_por_app}
                loading={loading}
                labelA="Analista"
                labelB="Aplicación"
                colorA="#fd006e"
                colorB="#fd006e"
              />
            </div>
          </>
        ) : (
          <>
            {/* Abiertos por aplicación (no-evo / evo) */}
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

            {/* Abiertos por fecha (tabla + gráfico vertical simple) */}
            <div className="mt-8">
              <PanelConToggle
                title={`Abiertos por fecha (30d) — ${VIEWS.find(v=>v.key===viewKey)?.label || ""}`}
                rows={abiertos_por_fecha}
                loading={loading}
                labelA="Fecha (dd/mm/aaaa)"
                color="#7c3aed"
                defaultMode="table"
              />
            </div>
          </>
        )}

        {warn && (
          <div className="mt-6 rounded-xl border-2 border-[#fd006e] text-[#fd006e] bg-white px-3 py-2 text-sm">
            {warn}
          </div>
        )}
      </div>
    </section>
  );
}
