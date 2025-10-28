// src/pages/Reportes.jsx
import React, { useEffect, useMemo, useState } from "react";
import { hasGoogle, initTokenClient, ensureToken, isSignedIn } from "../lib/googleAuth";
import { BarChart2 } from "lucide-react";

const API     = "https://sheets.googleapis.com/v4/spreadsheets";
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;

const SHEET_ID   = import.meta.env.VITE_PROG_SHEET_ID || import.meta.env.VITE_SHEETS_SPREADSHEET_ID;
const TAB_OPEN   = import.meta.env.VITE_PROG_SHEET_TAB || "Abiertos";
const TAB_CLOSED = import.meta.env.VITE_CERR_SHEET_TAB || "Cerrados";

const NORM = s => (s||"").toString().trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

// === filtros/constantes ===
const isEvo = (row) => NORM(row?.["Tipo"]) === "pedido de cambio";
const CLOSED_STATES = new Set(["resuelto","rechazados","cancelados","cerrados"].map(NORM));
// si querés restringir por mesa, poné nombres normalizados acá. vacío = todas.
const MESAS_FILTRO = new Set([]); // ej: new Set(["beesion", "nivel 1", "nivel 2", ...])

function parseDateMaybe(v) {
  if (v instanceof Date) return v;
  const s = (v||"").toString().trim();
  if (!s) return null;
  const m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?$/.exec(s);
  if (m) {
    const d=+m[1], mo=+m[2]-1, yy=+m[3]; const y = yy<100 ? 2000+yy : yy;
    const H=+m[4]||0, M=+m[5]||0;
    const dt = new Date(y,mo,d,H,M,0,0);
    return isNaN(dt) ? null : dt;
  }
  const d2 = new Date(s);
  return isNaN(d2) ? null : d2;
}
function withinLastDays(date, days) {
  if (!date) return false;
  const d = parseDateMaybe(date);
  if (!d) return false;
  const now = new Date();
  const from = new Date(now.getTime() - days*24*60*60*1000);
  return d >= from && d <= now;
}
function groupByCount(list, col) {
  const map = new Map();
  for (const r of list) {
    const key = (r[col] || "—").toString().trim() || "—";
    map.set(key, (map.get(key)||0)+1);
  }
  return Array.from(map.entries()).sort((a,b)=> b[1]-a[1]).slice(0,50);
}

// === UI helpers ===
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
          {!loading && rows?.length===0 && <tr><td colSpan={2} className="px-3 py-3 text-slate-500">Sin datos</td></tr>}
          {rows?.map(([name, count])=>(
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

function BarChart({ rows, color = "#398FFF" }) {
  const max = rows.reduce((m, [,c]) => Math.max(m, c), 1);
  return (
    <div className="mt-3 space-y-2">
      {rows.map(([name, count])=>(
        <div key={name}>
          <div className="flex justify-between text-sm">
            <div className="truncate pr-2">{name}</div>
            <div className="text-slate-500">{count}</div>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(count/max)*100}%`, background: color }} />
          </div>
        </div>
      ))}
      {rows.length===0 && <div className="text-sm text-slate-500">Sin datos</div>}
    </div>
  );
}

function PanelConToggle({ title, rows, loading, labelA, color="#398FFF", defaultMode="chart" }) {
  const [mode, setMode] = useState(defaultMode); // "chart" | "table"
  return (
    <div className="rounded-2xl border-2 border-[#398FFF] p-6 bg-white">
      <div className="flex items-center justify-between gap-2">
        <div className="font-semibold text-[#398FFF]">{title}</div>
        <div className="inline-flex rounded-xl border-2 overflow-hidden border-[#398FFF]">
          <button
            onClick={()=>setMode("chart")}
            className={`px-3 py-1.5 text-sm ${mode==="chart"?"bg-[#398FFF] text-white":"text-[#398FFF]"}`}
            title="Ver gráfico"
          >
            Gráfico
          </button>
          <button
            onClick={()=>setMode("table")}
            className={`px-3 py-1.5 text-sm ${mode==="table"?"bg-[#398FFF] text-white":"text-[#398FFF]"}`}
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

export default function Reportes() {
  const [ready, setReady]       = useState(isSignedIn());
  const [rowsOpen, setRowsOpen] = useState([]);
  const [rowsClosed, setRowsClosed] = useState([]);
  const [loading, setLoading] = useState(false);
  const [warn, setWarn]       = useState(null);

  // conectar
  useEffect(()=>{
    if (!hasGoogle()) return;
    initTokenClient();
  },[]);

  const connect = async ()=>{ await ensureToken(); setReady(true); };

  // cargar Abiertos + Cerrados
  useEffect(()=>{
    let alive = true;
    (async ()=>{
      if (!ready || !SHEET_ID) return;
      setLoading(true); setWarn(null);

      const token = await ensureToken();

      async function fetchTab(tabName){
        const range = `'${(tabName).replace(/'/g,"''")}'!A1:ZZ20000`;
        const url = `${API}/${SHEET_ID}/values/${encodeURIComponent(range)}?key=${API_KEY}`;
        const data = await fetch(url, { headers:{ Authorization:`Bearer ${token}` }}).then(r=>r.json());
        const values = data?.values || [];
        if (!values.length) return [];
        const hdr = values[0].map(h=>(h||"").trim());
        return values.slice(1).filter(r=>r && r.some(c=>String(c).trim()!==""))
          .map(r => Object.fromEntries(hdr.map((h,i)=>[h, r[i] ?? ""])));
      }

      try{
        const [open, closed] = await Promise.all([fetchTab(TAB_OPEN), fetchTab(TAB_CLOSED)]);
        if (!alive) return;
        setRowsOpen(open);
        setRowsClosed(closed);
      }catch(e){
        console.error("Reportes load", e);
        if (alive) setWarn("No pude leer las hojas (revisá permisos/API key/token).");
      }finally{
        if (alive) setLoading(false);
      }
    })();
    return ()=>{alive=false;};
  }, [ready, SHEET_ID, TAB_OPEN, TAB_CLOSED]);

  // filtro de mesas (si MESAS_FILTRO vacío => todas)
  const mesaOK = (row) => {
    if (MESAS_FILTRO.size===0) return true;
    const m = NORM(row["Mesa"] || row["Mesa asignada"]);
    return MESAS_FILTRO.has(m);
  };

  // === KPI creados últimos 30 días (desde Abiertos)
  const ult30_creados_noevo = useMemo(()=>{
    return rowsOpen.filter(mesaOK).filter(r => !isEvo(r) && withinLastDays(r["Fecha de creación"], 30)).length;
  }, [rowsOpen]);
  const ult30_creados_evo = useMemo(()=>{
    return rowsOpen.filter(mesaOK).filter(r => isEvo(r) && withinLastDays(r["Fecha de creación"], 30)).length;
  }, [rowsOpen]);

  // === Base Cerrados últimos 30 días (por estado y fecha fin)
  // detectar la col “Fecha fin”
  const cierreCol = useMemo(()=>{
    const keys = rowsClosed.length ? Object.keys(rowsClosed[0]) : [];
    const found = keys.find(k => NORM(k) === NORM("Fecha fin"));
    if (!found) setWarn(w => w || "No encuentro columna 'Fecha fin' en Cerrados.");
    return found || null;
  }, [rowsClosed]);

  const cerradosBase = useMemo(()=>{
    if (!cierreCol) return [];
    return rowsClosed
      .filter(mesaOK)
      .filter(r => CLOSED_STATES.has(NORM(r["Estado"])))
      .filter(r => withinLastDays(r[cierreCol], 30));
  }, [rowsClosed, cierreCol]);

  const cerradosNoEvo = useMemo(()=> cerradosBase.filter(r=>!isEvo(r)), [cerradosBase]);
  const cerradosEvo   = useMemo(()=> cerradosBase.filter(isEvo),       [cerradosBase]);

  // === Grupos
  const noEvo_por_analista = useMemo(()=> groupByCount(cerradosNoEvo, "Agente asignado"), [cerradosNoEvo]);
  const noEvo_por_app      = useMemo(()=> groupByCount(cerradosNoEvo, "Módulo"),           [cerradosNoEvo]);

  const evo_por_analista   = useMemo(()=> groupByCount(cerradosEvo, "Agente asignado"),    [cerradosEvo]);
  const evo_por_app        = useMemo(()=> groupByCount(cerradosEvo, "Módulo"),            [cerradosEvo]);

  if (!SHEET_ID) {
    return <section className="bg-white"><div className="mx-auto max-w-7xl p-8">
      <div className="rounded-2xl border-2 border-[#fd006e] p-4 text-[#fd006e]">Falta <code>VITE_PROG_SHEET_ID</code> o <code>VITE_SHEETS_SPREADSHEET_ID</code>.</div>
    </div></section>;
  }
  if (!ready) {
    return <section className="bg-white"><div className="mx-auto max-w-7xl p-8">
      <div className="rounded-2xl border-2 border-[#398FFF] p-6">
        <div className="text-lg font-semibold text-[#398FFF]">Conectar Google</div>
        <p className="text-sm mt-1">Necesito permiso para leer tus hojas <b>{TAB_OPEN}</b> y <b>{TAB_CLOSED}</b>.</p>
        <button onClick={connect} className="mt-3 px-4 py-2 rounded-xl bg-[#398FFF] text-white">Conectar</button>
      </div>
    </div></section>;
  }

  return (
    <section className="bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-2 text-[#398FFF] mb-4">
          <BarChart2 className="w-5 h-5" />
          <h2 className="text-2xl font-bold">Reportes — últimos 30 días</h2>
        </div>

        {warn && <div className="mb-4 rounded-xl border-2 border-[#fd006e] text-[#fd006e] bg-white px-3 py-2 text-sm">{warn}</div>}

        {/* KPIs creados */}
        <div className="grid sm:grid-cols-2 gap-6">
          <div className="rounded-2xl border-2 border-[#398FFF] p-6">
            <div className="text-slate-500 text-sm">No evolutivos creados</div>
            <div className="mt-2 text-5xl font-extrabold">{loading ? "…" : ult30_creados_noevo}</div>
            <div className="text-xs text-slate-500 mt-2">Últimos 30 días</div>
          </div>
          <div className="rounded-2xl border-2 border-[#398FFF] p-6">
            <div className="text-slate-500 text-sm">Evolutivos creados</div>
            <div className="mt-2 text-5xl font-extrabold">{loading ? "…" : ult30_creados_evo}</div>
            <div className="text-xs text-slate-500 mt-2">Tipo = “Pedido de cambio”</div>
          </div>
        </div>

        {/* Cerrados por Analista / App con toggle Tabla/Gráfico */}
        <div className="mt-8 grid lg:grid-cols-2 gap-6">
          <PanelConToggle
            title="No evolutivos cerrados por Analista"
            rows={noEvo_por_analista}
            loading={loading}
            labelA="Analista"
            color="#398FFF"
            defaultMode="chart"
          />
          <PanelConToggle
            title="No evolutivos cerrados por Aplicación"
            rows={noEvo_por_app}
            loading={loading}
            labelA="Aplicación"
            color="#398FFF"
            defaultMode="chart"
          />
        </div>

        <div className="mt-8 grid lg:grid-cols-2 gap-6">
          <PanelConToggle
            title="Evolutivos cerrados por Analista"
            rows={evo_por_analista}
            loading={loading}
            labelA="Analista"
            color="#fd006e"
            defaultMode="chart"
          />
          <PanelConToggle
            title="Evolutivos cerrados por Aplicación"
            rows={evo_por_app}
            loading={loading}
            labelA="Aplicación"
            color="#fd006e"
            defaultMode="chart"
          />
        </div>
      </div>
    </section>
  );
}
