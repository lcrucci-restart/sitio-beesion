import React, { useEffect, useMemo, useState } from "react";
import { hasGoogle, initTokenClient, ensureToken, isSignedIn } from "../lib/googleAuth";
import { readAbiertos, readCerrados } from "../lib/sheets";
import { BarChart2 } from "lucide-react";

// === Recharts ===
import {
  ResponsiveContainer, BarChart as RBarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList
} from "recharts";

// === Config ===
// Si querés filtrar por un subconjunto de mesas, poné un Set en MESAS_INCLUIR (valores ya normalizados, ej. "nivel 1")
// Si querés incluir TODAS las mesas, dejá MESAS_INCLUIR = null
const MESAS_INCLUIR = null;
// Ejemplo de filtro si lo necesitás luego:
// const MESAS_INCLUIR = new Set(["nivel 1","nivel 2","nivel 3","product","catu","ing red"]);

const NORM = (s) => (s ?? "").toString().trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const isEvo = (row) => NORM(row?.["Tipo"]) === "pedido de cambio";

// Estados “cerrados” (flexibles: singular/plural/género/variaciones)
function isClosedState(v) {
  const n = NORM(v);
  // cubre: cerrado / cerrada / cerrados / cerradas / cerrado por usuario, etc.
  //        cancelado / cancelada / cancelados / canceladas
  //        rechazado / rechazada / rechazados / rechazadas
  //        resuelto / resuelta / resueltos / resueltas
  return /(cerrad|cancelad|rechazad|resuelt)/.test(n);
}

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

function groupCount(list, col) {
  const map = new Map();
  for (const r of list) {
    const key = (r[col] || "—").toString().trim() || "—";
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 50);
}

function filterByMesas(rows, colName) {
  if (!MESAS_INCLUIR) return rows; // sin filtro: todas las mesas
  return rows.filter((r) => MESAS_INCLUIR.has(NORM(r[colName])));
}

/* ===== Util para llevar [[name,count]] -> [{name, value}] ===== */
function toSeries(rows, topN = 20) {
  return rows.slice(0, topN).map(([name, count]) => ({ name, value: count }));
}

/* ===== Chart con estilo “Sheets-like” (Recharts) ===== */
function BarsSheetsLike({ rows, color = "#398FFF", topN = 20 }) {
  const data = toSeries(rows, topN);

  return (
    <div className="mt-3" style={{ height: 360 }}>
      <ResponsiveContainer width="100%" height="100%">
        <RBarChart data={data} margin={{ top: 8, right: 24, bottom: 40, left: 12 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="name"
            angle={-20}
            textAnchor="end"
            interval={0}
            height={60}
            tick={{ fontSize: 11 }}
          />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(v)=>[v, "Cerrados (30d)"]} />
          <Legend verticalAlign="top" height={24} />
          <Bar dataKey="value" name="Cerrados (30d)" fill={color} radius={[6,6,0,0]}>
            <LabelList dataKey="value" position="top" fontSize={11} />
          </Bar>
        </RBarChart>
      </ResponsiveContainer>
      <div className="text-xs text-slate-500 mt-2">Top {Math.min(topN, rows.length)} ítems</div>
    </div>
  );
}

/* ===== Tabla simple ===== */
function TableList({ rows, loading, labelA }) {
  return (
    <div className="mt-3">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-[#E3F2FD]">
            <th className="text-left px-3 py-2">{labelA}</th>
            <th className="text-right px-3 py-2">Cerrados (30d)</th>
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

/* ===== Panel con toggle Tabla/Gráfico (usa Recharts) ===== */
function PanelConToggle({
  title, rows, loading, labelA,
  color = "#398FFF", defaultMode = "chart"
}) {
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
        ? <BarsSheetsLike rows={rows} color={color} />
        : <TableList rows={rows} loading={loading} labelA={labelA} />
      }
    </div>
  );
}

export default function Reportes() {
  const [ready, setReady] = useState(isSignedIn());
  const [loading, setLoading] = useState(false);
  const [warn, setWarn] = useState(null);

  const [abiertos, setAbiertos] = useState([]);
  const [cerrados, setCerrados] = useState([]);

  useEffect(() => { if (hasGoogle()) initTokenClient(); }, []);
  const connect = async () => { await ensureToken(); setReady(true); };

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!ready) return;
      setLoading(true);
      setWarn(null);
      try {
        const [a, c] = await Promise.all([
          readAbiertos().catch(() => ({ rows: [], headers: [] })),
          readCerrados().catch(() => ({ rows: [], headers: [] })),
        ]);
        if (!alive) return;
        setAbiertos(Array.isArray(a.rows) ? a.rows : []);
        setCerrados(Array.isArray(c.rows) ? c.rows : []);

        const needColsC = ["Fecha fin", "Estado"];
        const missing = needColsC.filter((h) => !(c.headers || []).includes(h));
        if (missing.length) {
          setWarn(`No encuentro columna de cierre en Cerrados (p. ej. “Fecha fin”). Faltan: ${missing.join(", ")}`);
        }
      } catch (e) {
        if (alive) setWarn("No pude leer Abiertos/Cerrados (permisos / env / Google API).");
        console.error(e);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [ready]);

  // Abiertos → “Mesa”
  const abiertosBase = useMemo(() => filterByMesas(abiertos, "Mesa"), [abiertos]);

  const ult30_creados_noevo = useMemo(
    () => abiertosBase.filter((r) => !isEvo(r) && withinLastDays(r["Fecha de creación"], 30)).length,
    [abiertosBase]
  );
  const ult30_creados_evo = useMemo(
    () => abiertosBase.filter((r) =>  isEvo(r) && withinLastDays(r["Fecha de creación"], 30)).length,
    [abiertosBase]
  );

  // Cerrados → “Mesa asignada”, Estado cerrado flexible, Fecha fin dentro de 30 días
  const cerradosBase = useMemo(() => {
    const filtrados = filterByMesas(cerrados, "Mesa asignada");
    return filtrados.filter(
      (r) => isClosedState(r["Estado"]) && withinLastDays(r["Fecha fin"], 30)
    );
  }, [cerrados]);

  const cerradosNoEvo = useMemo(() => cerradosBase.filter((r) => !isEvo(r)), [cerradosBase]);
  const cerradosEvo   = useMemo(() => cerradosBase.filter((r) =>  isEvo(r)), [cerradosBase]);

  const cerrados_noevo_por_analista = useMemo(
    () => groupCount(cerradosNoEvo, "Agente asignado"), [cerradosNoEvo]
  );
  const cerrados_noevo_por_app = useMemo(
    () => groupCount(cerradosNoEvo, "Módulo"), [cerradosNoEvo]
  );

  const cerrados_evo_por_analista = useMemo(
    () => groupCount(cerradosEvo, "Agente asignado"), [cerradosEvo]
  );
  const cerrados_evo_por_app = useMemo(
    () => groupCount(cerradosEvo, "Módulo"), [cerradosEvo]
  );

  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {!ready ? (
          <div className="rounded-2xl border-2 border-[#398FFF] p-6">
            <div className="text-lg font-semibold text-[#398FFF]">Conectar Google</div>
            <p className="text-sm mt-1">Necesito permiso para leer <b>Abiertos</b> y <b>Cerrados</b>.</p>
            <button onClick={connect} className="mt-3 px-4 py-2 rounded-xl bg-[#398FFF] text-white">
              Conectar
            </button>
          </div>
        ) : (
          <>
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
              <div className="rounded-2xl border-2 border-[#398FFF] p-6">
                <div className="text-slate-500 text-sm">No evolutivos creados</div>
                <div className="mt-2 text-5xl font-extrabold">{loading ? "…" : ult30_creados_noevo}</div>
                <div className="text-xs text-slate-500 mt-2">
                  {MESAS_INCLUIR ? "Mesas filtradas" : "Todas las mesas"}
                </div>
              </div>
              <div className="rounded-2xl border-2 border-[#398FFF] p-6">
                <div className="text-slate-500 text-sm">Evolutivos creados</div>
                <div className="mt-2 text-5xl font-extrabold">{loading ? "…" : ult30_creados_evo}</div>
                <div className="text-xs text-slate-500 mt-2">Tipo = “Pedido de cambio”</div>
              </div>
            </div>

            {/* Cerrados No Evo (toggle) */}
            <div className="mt-8 grid lg:grid-cols-2 gap-6">
              <PanelConToggle
                title="No evolutivos cerrados por Analista"
                rows={cerrados_noevo_por_analista}
                loading={loading}
                labelA="Analista"
                color="#398FFF"
                defaultMode="chart"
              />
              <PanelConToggle
                title="No evolutivos cerrados por Aplicación"
                rows={cerrados_noevo_por_app}
                loading={loading}
                labelA="Aplicación"
                color="#398FFF"
                defaultMode="chart"
              />
            </div>

            {/* Cerrados Evo (toggle) */}
            <div className="mt-8 grid lg:grid-cols-2 gap-6">
              <PanelConToggle
                title="Evolutivos cerrados por Analista"
                rows={cerrados_evo_por_analista}
                loading={loading}
                labelA="Analista"
                color="#fd006e"
                defaultMode="chart"
              />
              <PanelConToggle
                title="Evolutivos cerrados por Aplicación"
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
