// src/components/Dashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import { hasGoogle, initTokenClient, ensureToken, isSignedIn } from "../lib/googleAuth";
import { BarChart2, ChevronDown, ChevronRight } from "lucide-react";

const API = "https://sheets.googleapis.com/v4/spreadsheets";

// Usa las mismas env que Progreso
const SHEET_ID  = import.meta.env.VITE_PROG_SHEET_ID;
const SHEET_TAB = import.meta.env.VITE_PROG_SHEET_TAB || "Abiertos";
const SHEET_GID = import.meta.env.VITE_PROG_SHEET_GID;

const OPEN_STATES = ["Abierto", "Pendiente", "En espera"];
const norm = (s = "") =>
  s.toString().trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const OPEN_SET = new Set(OPEN_STATES.map(norm));

// Paleta para etiquetas (mismo criterio que en Progreso)
const LABEL_PALETTE = {
  "violeta":      { bg: "#F1E7FF", border:"#7E57C2", text:"#4A2C8C" },
  "rosa":         { bg: "#FDE7F3", border:"#E91E63", text:"#8A1846" },
  "verde-oscuro": { bg: "#E6F4EA", border:"#2E7D32", text:"#1B5E20" },
  "verde-claro":  { bg: "#ECFDF5", border:"#43A047", text:"#2E7D32" },
  "naranja":      { bg: "#FFF3E0", border:"#FB8C00", text:"#EF6C00" },
};
const hashPaletteKey = (name) => {
  const keys = ["violeta","rosa","verde-oscuro","verde-claro","naranja"];
  const code = Math.abs((name||"").split("").reduce((a,c)=>a+c.charCodeAt(0),0));
  return keys[code % keys.length];
};
const labelStyleFor = (labelName) => {
  if (!labelName) return null;
  const key = hashPaletteKey(labelName);
  return LABEL_PALETTE[key];
};

// Orden fijo para Mesa
const MESA_ORDER = ["Nivel 1", "Nivel 2", "Nivel 3", "Nivel Product"];
const normMesa = (s = "") => s.toString().trim().toLowerCase()
  .normalize("NFD").replace(/\p{Diacritic}/gu, "");
const orderIndex = (name) => {
  const n = normMesa(name);
  for (let i = 0; i < MESA_ORDER.length; i++) {
    if (n.includes(normMesa(MESA_ORDER[i]))) return i;
  }
  return 999; // las no contempladas, al final
};

// Evolutivos = Tipo === "Pedido de cambio"
const isEvolutivo = (row) => norm(row?.["Tipo"] || "") === "pedido de cambio";

export default function Dashboard() {
  const [ready, setReady]     = useState(isSignedIn());
  const [tabName, setTabName] = useState(SHEET_TAB);
  const [rows, setRows]       = useState([]);     // objetos por encabezado
  const [loading, setLoading] = useState(false);

  // vista: cómo agrupar
  const [view, setView]       = useState("mesa"); // "mesa" | "modulo"
  // dataset: qué conjunto mostrar en la distribución
  const [dataset, setDataset] = useState("inv");  // "inv" (no evolutivos) | "evo" (evolutivos)

  // expand/collapse por etiqueta
  const [openLabels, setOpenLabels] = useState(() => new Set());

  // Conectar (igual que tus tablas)
  const connect = async () => {
    if (!hasGoogle()) return alert("Falta el script de Google Identity Services.");
    initTokenClient();
    await ensureToken();
    setReady(true);
  };

  // Resolver nombre de pestaña por GID (si hace falta)
  useEffect(() => {
    let stop = false;
    (async () => {
      const gid = SHEET_GID;
      if (tabName || !SHEET_ID || !gid) return;
      try {
        await ensureToken();
        const meta = await fetch(
          `${API}/${SHEET_ID}?fields=sheets.properties`,
          { headers: { Authorization: `Bearer ${await ensureToken()}` } }
        ).then(r => r.json());
        const match = meta?.sheets?.find(
          s => String(s?.properties?.sheetId) === String(gid)
        );
        if (match && !stop) setTabName(match.properties.title);
      } catch (e) {
        console.warn("No pude resolver pestaña por gid:", e);
      }
    })();
    return () => { stop = true; };
  }, [tabName]);

  // Cargar datos desde Master
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!ready || !SHEET_ID) return;
      const activeTab = tabName || SHEET_TAB;
      if (!activeTab && SHEET_GID) return; // esperando resolver el nombre
      setLoading(true);
      try {
        const quoted = `'${(activeTab).replace(/'/g, "''")}'`;
        const range = `${quoted}!A1:ZZ20000`;
        const res = await fetch(`${API}/${SHEET_ID}/values/${encodeURIComponent(range)}`, {
          headers: { Authorization: `Bearer ${await ensureToken()}` },
        });
        const data = await res.json();
        const values = data?.values || [];
        if (!values.length) {
          if (alive) setRows([]);
          return;
        }
        const hdr = values[0].map(h => (h || "").trim());
        const body = values.slice(1)
          .filter(r => r && r.some(c => String(c).trim() !== "")) // evita filas totalmente vacías
          .map(r => Object.fromEntries(hdr.map((h, i) => [h, r[i] ?? ""])));
        if (alive) setRows(body);
      } catch (e) {
        console.error("Dashboard: error leyendo Master", e);
        if (alive) setRows([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [ready, tabName, SHEET_ID, SHEET_TAB, SHEET_GID]);

  // Solo abiertos
  const abiertos = useMemo(() => rows.filter(r => OPEN_SET.has(norm(r["Estado"]))), [rows]);

  // Separación: abiertos sin evolutivos vs evolutivos
  const abiertosInv = useMemo(() => abiertos.filter(r => !isEvolutivo(r)), [abiertos]);
  const abiertosEvo = useMemo(() => abiertos.filter(isEvolutivo), [abiertos]);

  const totalInv = abiertosInv.length;  // abiertos (sin evolutivos)
  const totalEvo = abiertosEvo.length;  // evolutivos abiertos

  // Base para la distribución según dataset elegido
  const base = dataset === "evo" ? abiertosEvo : abiertosInv;

  // Distribución por Mesa/Módulo
  const grouping = useMemo(() => {
    const key = view === "mesa" ? "Mesa" : "Módulo";
    const map = new Map();
    for (const r of base) {
      const k = (r[key] || "—").toString().trim() || "—";
      map.set(k, (map.get(k) || 0) + 1);
    }

    let arr = Array.from(map.entries()).map(([name, count]) => ({ name, count }));

    if (view === "mesa") {
      // Orden fijo: Nivel 1, Nivel 2, Nivel 3, Nivel Product, y luego el resto alfabético
      arr.sort((a, b) => {
        const ai = orderIndex(a.name);
        const bi = orderIndex(b.name);
        if (ai !== bi) return ai - bi;
        return a.name.localeCompare(b.name);
      });
    } else {
      // Módulo en orden por cantidad desc
      arr.sort((a, b) => b.count - a.count);
    }

    return arr.slice(0, 12);
  }, [base, view]);

  const max = grouping.reduce((m, x) => Math.max(m, x.count), 1);

  // ===== Etiquetas (solo en abiertos totales) =====
  // Mapea: nombre -> { name, count, items: [{Invgate, Asunto}] }
  const etiquetas = useMemo(() => {
    const map = new Map();
    for (const r of abiertos) {
      const name = (r["Etiqueta"] || "").toString().trim();
      if (!name) continue; // ignorar vacíos
      const entry = map.get(name) || { name, items: [] };
      entry.items.push({ id: r["Invgate"], asunto: r["Asunto"] || "" });
      map.set(name, entry);
    }
    const list = Array.from(map.values()).map(e => ({ ...e, count: e.items.length }));
    list.sort((a,b) => b.count - a.count || a.name.localeCompare(b.name));
    return list;
  }, [abiertos]);

  const toggleLabel = (name) => {
    setOpenLabels(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  // Estados de conexión
  if (!SHEET_ID) {
    return (
      <section id="inicio" className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
          <div className="rounded-2xl border-2 border-[#fd006e] p-4 bg-white text-[#fd006e]">
            Falta configurar <code>VITE_PROG_SHEET_ID</code> en tu <code>.env</code>.
          </div>
        </div>
      </section>
    );
  }

  if (!ready) {
    return (
      <section id="inicio" className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
          <div className="rounded-2xl border-2 border-[#398FFF] p-6 bg-white">
            <div className="text-lg font-semibold text-[#398FFF]">Conectar Google</div>
            <p className="text-sm mt-1">Para leer la hoja <b>Master</b>, conectá tu cuenta.</p>
            <button
              onClick={connect}
              className="mt-3 px-4 py-2 rounded-xl bg-[#398FFF] text-white hover:opacity-90">
              Conectar
            </button>
          </div>
        </div>
      </section>
    );
  }

  if (!tabName && !SHEET_TAB && SHEET_GID) {
    return (
      <section id="inicio" className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
          <div className="rounded-2xl border-2 border-[#398FFF] p-4 bg-white">
            Resolviendo pestaña a partir del <code>gid</code>…
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="inicio" className="border-b border-slate-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-bold">Panel de Control</h2>
            <p className="mt-2 text-slate-600">
              Resumen de <b>casos abiertos</b> (Abierto / Pendiente / En espera) desde <span className="font-semibold">Master</span>.
            </p>
          </div>

          {/* selector de agrupación */}
          <div className="inline-flex rounded-xl border-2 overflow-hidden">
            <button
              onClick={() => setView("mesa")}
              className={`px-4 py-2 text-sm ${view==="mesa"?"bg-[#398FFF] text-white":"text-[#398FFF]"}`}
            >
              Vista por Mesa
            </button>
            <button
              onClick={() => setView("modulo")}
              className={`px-4 py-2 text-sm ${view==="modulo"?"bg-[#398FFF] text-white":"text-[#398FFF]"}`}
            >
              Vista por Módulo
            </button>
          </div>
        </div>

        {/* Totales: abiertos (sin evolutivos) y evolutivos abiertos */}
        <div className="mt-6 grid sm:grid-cols-3 gap-6">
          <div className="rounded-2xl border-2 border-[#398FFF] p-6 bg-white">
            <div className="text-slate-500 text-sm">Casos abiertos (sin evolutivos)</div>
            <div className="mt-2 text-5xl font-extrabold">{loading ? "…" : totalInv}</div>
          </div>

          <div className="rounded-2xl border-2 border-[#398FFF] p-6 bg-white">
            <div className="text-slate-500 text-sm">Evolutivos abiertos</div>
            <div className="mt-2 text-5xl font-extrabold">{loading ? "…" : totalEvo}</div>
          </div>

          {/* Distribución (usa dataset seleccionado) */}
          <div className="sm:col-span-3 rounded-2xl border-2 border-[#398FFF] p-6 bg-white">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-[#398FFF] font-semibold">
                <BarChart2 className="w-5 h-5" />
                Distribución por {view === "mesa" ? "Mesa" : "Módulo"}
              </div>

              {/* selector de dataset: inv vs evo */}
              <div className="inline-flex rounded-xl border-2 overflow-hidden border-[#398FFF]">
                <button
                  onClick={()=>setDataset("inv")}
                  className={`px-3 py-1.5 text-sm ${dataset==="inv"?"bg-[#398FFF] text-white":"text-[#398FFF]"}`}
                  title="Ver casos abiertos (sin evolutivos)"
                >
                  Invgates
                </button>
                <button
                  onClick={()=>setDataset("evo")}
                  className={`px-3 py-1.5 text-sm ${dataset==="evo"?"bg-[#398FFF] text-white":"text-[#398FFF]"}`}
                  title="Ver evolutivos abiertos"
                >
                  Evolutivos
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              {grouping.map(row => (
                <div key={row.name}>
                  <div className="flex justify-between text-sm">
                    <div className="font-medium">{row.name}</div>
                    <div className="text-slate-500">{row.count}</div>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(row.count / max) * 100}%`,
                        background: "#398FFF"
                      }}
                    />
                  </div>
                </div>
              ))}
              {!loading && grouping.length === 0 && (
                <div className="text-sm text-slate-500">Sin datos en esta selección.</div>
              )}
              {loading && <div className="text-sm text-slate-500">Cargando…</div>}
            </div>
          </div>
        </div>

        {/* ===== Etiquetas en casos abiertos (todas) ===== */}
        <div className="mt-8 rounded-2xl border-2 border-[#398FFF] p-6 bg-white">
          <div className="text-[#398FFF] font-semibold">Etiquetas (casos abiertos)</div>
          <p className="text-sm text-slate-600 mt-1">
            Resumen de etiquetas creadas en los casos abiertos. Expandí para ver los invgates asignados.
          </p>

          {etiquetas.length === 0 && (
            <div className="mt-4 text-sm text-slate-500">No hay etiquetas en casos abiertos.</div>
          )}

          <div className="mt-4 space-y-2">
            {etiquetas.map(e => {
              const style = labelStyleFor(e.name);
              const open  = openLabels.has(e.name);
              return (
                <div key={e.name} className="border rounded-xl">
                  <button
                    className="w-full flex items-center justify-between px-3 py-2 text-left"
                    onClick={() => toggleLabel(e.name)}
                    style={{ borderColor: style?.border }}
                  >
                    <div className="flex items-center gap-2">
                      {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      <span
                        className="text-sm px-2 py-0.5 rounded-full"
                        style={{ background: style?.bg, color: style?.text, border:`1px solid ${style?.border}` }}
                      >
                        {e.name}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500">{e.count} caso(s)</div>
                  </button>

                  {open && (
                    <div className="px-4 pb-3">
                      <ul className="text-sm list-disc pl-5">
                        {e.items.map(it => (
                          <li key={it.id}>
                            <span className="font-medium">{it.id}</span> — {it.asunto || "Sin asunto"}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}





