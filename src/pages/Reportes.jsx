// src/pages/Reportes.jsx
import React, { useEffect, useMemo, useState } from "react";
import { hasGoogle, initTokenClient, ensureToken, isSignedIn } from "../lib/googleAuth";
import { BarChart2 } from "lucide-react";
import { readReporteAbiertos } from "../lib/sheets";

/** ================== CONFIG ================== */

// Pestaña master normalizada en tu Sheet
const TAB_ABIERTOS = "Reporte Abiertos";

// Vistas (coinciden con valores ya normalizados en "Mesa asignada")
const VIEWS = [
  { key: "global",    label: "Global",    mesas: null }, // sin filtro = todas
  // Beesion agrupa Nivel 1 / 2 / 3 (tu diccionario lo deja así)
  { key: "beesion",   label: "Beesion",   mesas: new Set(["nivel 1", "nivel 2", "nivel 3"]) },
  { key: "tenfold",   label: "Tenfold",   mesas: new Set(["tenfold"]) },
  { key: "invgate",   label: "InvGate",   mesas: new Set(["invgate"]) },
  { key: "sharepoint",label: "SharePoint",mesas: new Set(["sharepoint"]) },
];

// Nombres de columnas EXACTOS en la master normalizada (GAS)
const COLS = {
  modulo:       "Módulo",
  tipo:         "Tipo",
  mesaAsignada: "Mesa asignada",
  fecCre:       "Fecha de creación",
};

// normalizador de strings (para comparar vistas/mesas con tildes, etc.)
const NORM = (s) =>
  (s ?? "")
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

// ¿es evolutivo?
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

function withinLastDays(date, days) {
  const d = parseDateMaybe(date);
  if (!d) return false;
  const now = new Date();
  const from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return d >= from && d <= now;
}

// group by simple
function groupCount(list, col) {
  const map = new Map();
  for (const r of list) {
    const key = (r[col] || "—").toString().trim() || "—";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 50);
}

// aplica filtro por VISTA (mesas)
function filterByView(rows, view, mesaColName = COLS.mesaAsignada) {
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

  // selección de vista (Global / Beesion / Tenfold / InvGate / SharePoint)
  const [viewKey, setViewKey] = useState("beesion");  // default Beesion
  const view = useMemo(() => VIEWS.find(v => v.key === viewKey) || VIEWS[0], [viewKey]);

  useEffect(() => { if (hasGoogle()) initTokenClient(); }, []);
  const connect = async () => { await ensureToken(); setReady(true); };

  // Carga única de "Reporte Abiertos"
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!ready) return;
      setLoading(true);
      setWarn(null);
      try {
        const a = await readReporteAbiertos().catch(() => ({ rows: [], headers: [] }));
        if (!alive) return;

        // Guardamos todas las filas
        const all = Array.isArray(a.rows) ? a.rows : [];
        setRowsAbiertos(all);

        // Avisos mínimos de columnas clave
        const missingA = [];
        const headersA = a?.headers || [];
        if (!headersA.includes(COLS.mesaAsignada)) missingA.push(COLS.mesaAsignada);
        if (!headersA.includes(COLS.modulo))       missingA.push(COLS.modulo);
        if (!headersA.includes(COLS.fecCre))       missingA.push(COLS.fecCre);

        if (missingA.length) setWarn(`Revisá columnas en "${TAB_ABIERTOS}": faltan ${missingA.join(", ")}`);
      } catch (e) {
        if (alive) setWarn("No pude leer Reporte Abiertos (permisos / env / Google API).");
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [ready]);

  /** ====== Helpers específicos ====== */

  // 1) Filtramos por vista (usa Mesa asignada)
  const abiertosByView = useMemo(() => filterByView(rowsAbiertos, view), [rowsAbiertos, viewKey]);

  // 2) Seguridad: volvemos a filtrar 30d por Fecha de creación (aunque ya venga del CSV)
  const abiertos30d = useMemo(
    () => abiertosByView.filter((r) => withinLastDays(r[COLS.fecCre], 30)),
    [abiertosByView]
  );

  // 3) Split evolutivo / no evolutivo
  const abiertosNoEvo = useMemo(() => abiertos30d.filter((r) => !isEvo(r)), [abiertos30d]);
  const abiertosEvo   = useMemo(() => abiertos30d.filter((r) =>  isEvo(r)), [abiertos30d]);

  // 4) Agregados por Aplicación (Módulo)
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
            <p className="text-sm mt-1">Necesito permiso para leer <b>{TAB_ABIERTOS}</b>.</p>
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
          <h2 className="text-2xl font-bold">Reportes — abiertos en los últimos 30 días</h2>
        </div>

        {/* Controles: vista */}
        <div className="flex flex-wrap gap-2 mb-4">
          {VIEWS.map(v => (
            <button key={v.key}
              onClick={()=>setViewKey(v.key)}
              className={`px-3 py-1.5 rounded-xl border-2 ${viewKey===v.key ? "bg-[#398FFF] text-white border-[#398FFF]" : "text-[#398FFF] border-[#398FFF]"}`}>
              {v.label}
            </button>
          ))}
        </div>

        {/* Info head rápida */}
        <div className="text-sm text-slate-600 mb-6">
          <b>Abiertos cargados:</b> {rowsAbiertos.length} &nbsp;|&nbsp; <b>Vista:</b> {VIEWS.find(v=>v.key===viewKey)?.label ?? "Global"} &nbsp;|&nbsp; <b>Abiertos filtrados (30d):</b> {abiertos30d.length}
        </div>

        {/* Bloques: solo por Aplicación */}
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

        {warn && (
          <div className="mt-6 rounded-xl border-2 border-[#fd006e] text-[#fd006e] bg-white px-3 py-2 text-sm">
            {warn}
          </div>
        )}
      </div>
    </section>
  );
}
