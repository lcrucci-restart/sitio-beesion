// src/components/Reportes.jsx
import React, { useEffect, useMemo, useState } from "react";
import { hasGoogle, initTokenClient, ensureToken, isSignedIn } from "../lib/googleAuth";
import { readAbiertos, readCerrados } from "../lib/sheets";
import { BarChart2 } from "lucide-react";

// Mesas requeridas
const MESAS_TARGET = new Set(["beesion", "tenfold", "invgate", "sharepoint"].map(s => s.toLowerCase()));
// Estados que se consideran “cerrado”
const CLOSED_STATES = new Set(["resuelto", "rechazados", "cancelados", "cerrados"].map(s => s.toLowerCase()));

const NORM = (s) => (s ?? "").toString().trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const isEvo = (row) => NORM(row?.["Tipo"]) === "pedido de cambio";

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

export default function Reportes() {
  const [ready, setReady] = useState(isSignedIn());
  const [loading, setLoading] = useState(false);
  const [warn, setWarn] = useState(null);

  const [abiertos, setAbiertos] = useState([]); // Hoja “Abiertos”
  const [cerrados, setCerrados] = useState([]); // Hoja “Cerrados”

  // auth
  useEffect(() => {
    if (!hasGoogle()) return;
    initTokenClient();
  }, []);

  const connect = async () => {
    await ensureToken();
    setReady(true);
  };

  // cargar Abiertos + Cerrados
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!ready) return;
      setLoading(true);
      setWarn(null);
      try {
        const [a, c] = await Promise.all([
          readAbiertos().catch((e) => { console.error("readAbiertos", e); return { rows: [] }; }),
          readCerrados().catch((e) => { console.error("readCerrados", e); return { rows: [] }; }),
        ]);
        if (!alive) return;
        setAbiertos(Array.isArray(a.rows) ? a.rows : []);
        setCerrados(Array.isArray(c.rows) ? c.rows : []);

        // chequeo de columnas clave en Cerrados
        const needColsC = ["Fecha fin", "Estado"];
        const missing = needColsC.filter((h) => !((c.headers || []).includes(h)));
        if (missing.length) {
          setWarn(`No encuentro columna de cierre en Cerrados (p. ej. “Fecha fin”). Faltan: ${missing.join(", ")}`);
        }
      } catch (e) {
        console.error("Reportes load", e);
        if (alive) setWarn("No pude leer Abiertos/Cerrados (revisá permisos / env / Google API).");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [ready]);

  // Filtrar por mesas target
  const abiertosTarget = useMemo(() => {
    // En “Abiertos” la columna normalizada es “Mesa”
    return abiertos.filter((r) => MESAS_TARGET.has(NORM(r["Mesa"])));
  }, [abiertos]);

  const cerradosTarget = useMemo(() => {
    // En “Cerrados” la columna es “Mesa asignada”
    return cerrados.filter((r) => MESAS_TARGET.has(NORM(r["Mesa asignada"])));
  }, [cerrados]);

  // KPIs creados últimos 30 días (desde Abiertos)
  const ult30_creados_noevo = useMemo(() => {
    return abiertosTarget.filter((r) => !isEvo(r) && withinLastDays(r["Fecha de creación"], 30)).length;
  }, [abiertosTarget]);

  const ult30_creados_evo = useMemo(() => {
    return abiertosTarget.filter((r) => isEvo(r) && withinLastDays(r["Fecha de creación"], 30)).length;
  }, [abiertosTarget]);

  // Base de cerrados últimos 30 días (desde Cerrados)
  const cerradosBase = useMemo(() => {
    if (!cerradosTarget.length) return [];
    return cerradosTarget.filter(
      (r) => CLOSED_STATES.has(NORM(r["Estado"])) && withinLastDays(r["Fecha fin"], 30)
    );
  }, [cerradosTarget]);

  // 3) No evolutivos cerrados por Analista / Aplicación
  const cerradosNoEvo = useMemo(
    () => cerradosBase.filter((r) => !isEvo(r)),
    [cerradosBase]
  );
  const cerrados_noevo_por_analista = useMemo(
    () => groupCount(cerradosNoEvo, "Agente asignado"),
    [cerradosNoEvo]
  );
  const cerrados_noevo_por_app = useMemo(
    () => groupCount(cerradosNoEvo, "Módulo"),
    [cerradosNoEvo]
  );

  // 4) Evolutivos cerrados por Analista / Aplicación
  const cerradosEvo = useMemo(
    () => cerradosBase.filter((r) => isEvo(r)),
    [cerradosBase]
  );
  const cerrados_evo_por_analista = useMemo(
    () => groupCount(cerradosEvo, "Agente asignado"),
    [cerradosEvo]
  );
  const cerrados_evo_por_app = useMemo(
    () => groupCount(cerradosEvo, "Módulo"),
    [cerradosEvo]
  );

  if (!ready) {
    return (
      <section className="bg-white">
        <div className="mx-auto max-w-7xl p-8">
          <div className="rounded-2xl border-2 border-[#398FFF] p-6">
            <div className="text-lg font-semibold text-[#398FFF]">Conectar Google</div>
            <p className="text-sm mt-1">Necesito permiso para leer tus hojas <b>Abiertos</b> y <b>Cerrados</b>.</p>
            <button onClick={connect} className="mt-3 px-4 py-2 rounded-xl bg-[#398FFF] text-white">
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
          <div className="rounded-2xl border-2 border-[#398FFF] p-6">
            <div className="text-slate-500 text-sm">No evolutivos creados</div>
            <div className="mt-2 text-5xl font-extrabold">{loading ? "…" : ult30_creados_noevo}</div>
            <div className="text-xs text-slate-500 mt-2">Mesas: Beesion, Tenfold, InvGate, SharePoint</div>
          </div>
          <div className="rounded-2xl border-2 border-[#398FFF] p-6">
            <div className="text-slate-500 text-sm">Evolutivos creados</div>
            <div className="mt-2 text-5xl font-extrabold">{loading ? "…" : ult30_creados_evo}</div>
            <div className="text-xs text-slate-500 mt-2">Tipo = “Pedido de cambio”</div>
          </div>
        </div>

        {/* Cerrados por Analista / Aplicación (No Evo) */}
        <div className="mt-8 grid lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border-2 border-[#398FFF] p-6">
            <div className="font-semibold text-[#398FFF]">No evolutivos cerrados por Analista</div>
            <TableList rows={cerrados_noevo_por_analista} loading={loading} labelA="Analista" />
          </div>

          <div className="rounded-2xl border-2 border-[#398FFF] p-6">
            <div className="font-semibold text-[#398FFF]">No evolutivos cerrados por Aplicación</div>
            <TableList rows={cerrados_noevo_por_app} loading={loading} labelA="Aplicación" />
          </div>
        </div>

        {/* Cerrados por Analista / Aplicación (Evo) */}
        <div className="mt-8 grid lg:grid-cols-2 gap-6">
          <div className="rounded-2xl border-2 border-[#398FFF] p-6">
            <div className="font-semibold text-[#398FFF]">Evolutivos cerrados por Analista</div>
            <TableList rows={cerrados_evo_por_analista} loading={loading} labelA="Analista" />
          </div>

          <div className="rounded-2xl border-2 border-[#398FFF] p-6">
            <div className="font-semibold text-[#398FFF]">Evolutivos cerrados por Aplicación</div>
            <TableList rows={cerrados_evo_por_app} loading={loading} labelA="Aplicación" />
          </div>
        </div>
      </div>
    </section>
  );
}

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
          {loading && (
            <tr><td colSpan={2} className="px-3 py-3 text-slate-500">Cargando…</td></tr>
          )}
          {!loading && rows?.length === 0 && (
            <tr><td colSpan={2} className="px-3 py-3 text-slate-500">Sin datos</td></tr>
          )}
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
