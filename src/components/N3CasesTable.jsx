// src/components/N3CasesTable.jsx
import React, { useEffect, useMemo, useState } from "react";
import { RefreshCcw, Pencil, Save, X, XCircle } from "lucide-react";
import { hasGoogle, initTokenClient, ensureToken, isSignedIn } from "../lib/googleAuth";
import { readTable, updateByKey } from "../lib/sheets";

const SHEET_ID  = import.meta.env.VITE_N3_SHEET_ID || import.meta.env.VITE_PROG_SHEET_ID;
const SHEET_TAB = import.meta.env.VITE_N3_SHEET_TAB || "Tickets N3";
const SHEET_GID = import.meta.env.VITE_N3_SHEET_GID;

const KEY   = "Identificador de Caso";

// Colores de marca por fila
const MARKS = {
  amarillo: { label: "En prueba",        bg: "#FFFDE7", border: "#FBC02D", text: "#8d6e00" },
  celeste:  { label: "Para implementar", bg: "#E3F2FD", border: "#398FFF", text: "#1c4e9a" },
};

// helpers
const uniqSorted = (arr) => Array.from(new Set(arr.filter(Boolean))).sort((a,b)=>a.localeCompare(b));

export default function N3CasesTable() {
  const [ready, setReady]     = useState(isSignedIn());
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState(null);
  const [collapsed, setCollapsed] = useState(true); // contraído por defecto

  // filas leídas de Sheets (objetos con keys = encabezados)
  const [rows, setRows] = useState([]);

  // filtros (multi)
  const [fEstado, setFEstado]       = useState([]); // array strings
  const [fPrioridad, setFPrioridad] = useState([]);

  // selección / edición
  const [selectedId, setSelectedId] = useState(null);
  const [editId, setEditId]         = useState(null);
  const [draft, setDraft]           = useState({  // se editan estas 3 columnas
    "Estado Heber": "",
    "TIPO DE IMPACTO": "",
    "IMPACTO OPERATIVO": ""
  });

  const toast = (t) => { setMsg(t); setTimeout(()=>setMsg(null), 2400); };

  // ---------- auth ----------
  const connect = async () => {
    try {
      if (!hasGoogle()) return alert("Falta el script de Google Identity Services.");
      initTokenClient();
      await ensureToken();
      setReady(true);
    } catch (e) {
      console.error(e);
      alert("No se pudo conectar a Google.");
    }
  };

  // ---------- cargar datos de Sheets ----------
  const load = async () => {
    setLoading(true);
    try {
      await ensureToken();
      const { rows } = await readTable(SHEET_TAB, SHEET_ID);
      setRows(rows);
    } catch (e) {
      console.error(e);
      toast("No pude leer la hoja. Revisá permisos/ID.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (ready) load(); }, [ready]);

  // ---------- filtros (multi) ----------
  const opcionesEstado    = useMemo(() => uniqSorted(rows.map(r => r["Estado"])),    [rows]);
  const opcionesPrioridad = useMemo(() => uniqSorted(rows.map(r => r["Prioridad"])), [rows]);

  const filtered = useMemo(() => {
    let data = [...rows];
    if (fEstado.length)    data = data.filter(r => fEstado.includes(r["Estado"]));
    if (fPrioridad.length) data = data.filter(r => fPrioridad.includes(r["Prioridad"]));
    return data;
  }, [rows, fEstado, fPrioridad]);

  const clearFilters = () => { setFEstado([]); setFPrioridad([]); };
  const toggleSel = (setter) => (value) => {
    setter(prev => prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]);
  };

  // ---------- acciones de fila / edición ----------
  const startEdit = (row) => {
    setEditId(row[KEY]);
    setDraft({
      "Estado Heber": row["Estado Heber"] || "",
      "TIPO DE IMPACTO": row["TIPO DE IMPACTO"] || "",
      "IMPACTO OPERATIVO": row["IMPACTO OPERATIVO"] || ""
    });
  };
  const cancelEdit = () => { setEditId(null); setDraft({ "Estado Heber":"", "TIPO DE IMPACTO":"", "IMPACTO OPERATIVO":"" }); };

  const saveDraft = async (row) => {
    try {
      const key = row[KEY];
      await updateByKey(SHEET_TAB, KEY, [{ key, set: { ...draft } }], SHEET_ID);
      // refresco local
      setRows(prev => prev.map(r => r[KEY] === key ? { ...r, ...draft } : r));
      cancelEdit();
      toast("Guardado en Sheets ✓");
    } catch (e) { console.error(e); toast("No pude guardar. Revisá permisos."); }
  };

  const markRow = async (row, kind /* "amarillo"|"celeste"|"" */) => {
    try {
      const key = row[KEY];
      await updateByKey(SHEET_TAB, KEY, [{ key, set: { "Marca": kind } }], SHEET_ID);
      setRows(prev => prev.map(r => r[KEY] === key ? { ...r, "Marca": kind } : r));
      toast(kind ? "Marcado ✓" : "Marca quitada ✓");
    } catch (e) { console.error(e); toast("No pude actualizar la marca."); }
  };

  // ---------- UI ----------
  if (!ready) {
    return (
      <div className="rounded-2xl border-2 border-[#398FFF] p-6 bg-white">
        <div className="text-lg font-semibold text-[#398FFF]">Conectar Google</div>
        <p className="text-sm mt-1">Para leer/escribir en la hoja de N3, conectá tu cuenta.</p>
        <button onClick={connect} className="mt-3 px-4 py-2 rounded-xl bg-[#398FFF] text-white hover:opacity-90">
          Conectar
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-[#398FFF] bg-white overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-4 py-3 border-b-2 border-[#398FFF]">
        <div className="font-semibold">Casos N3</div>
        <div className="flex items-center gap-2">
          <button onClick={clearFilters} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border-2" style={{ borderColor:"#fd006e", color:"#fd006e" }}>
            <XCircle className="w-4 h-4" /> Limpiar filtros
          </button>
          <button
            onClick={() => setCollapsed(v=>!v)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-[#398FFF] text-[#398FFF] hover:bg-[#398FFF] hover:text-white"
            title={collapsed ? "Expandir tabla" : "Contraer tabla"}
          >
            {collapsed ? "Expandir" : "Contraer"}
          </button>
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-[#398FFF] text-[#398FFF] hover:bg-[#398FFF] hover:text-white">
            <RefreshCcw className="w-4 h-4" /> {loading ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </div>

      {/* Referencias + Acciones de marca */}
      <div className="px-4 py-3 border-b">
        <div className="text-sm font-medium mb-2">Referencias (marca por fila)</div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-4 h-4 rounded-sm" style={{ background: MARKS.amarillo.bg, outline:`2px solid ${MARKS.amarillo.border}` }} />
            Amarillo = En prueba
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-4 h-4 rounded-sm" style={{ background: MARKS.celeste.bg, outline:`2px solid ${MARKS.celeste.border}` }} />
            Celeste = Para implementar
          </span>
        </div>

        {selectedId && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="text-sm">Fila seleccionada: <span className="font-medium">{selectedId}</span></div>
            <button
              onClick={()=>{
                const r = rows.find(x=>x[KEY]===selectedId);
                if (r) markRow(r,"amarillo");
              }}
              className="px-3 py-1.5 rounded-lg border-2"
              style={{ borderColor: MARKS.amarillo.border, color: MARKS.amarillo.border }}
            >
              Marcar En prueba
            </button>
            <button
              onClick={()=>{
                const r = rows.find(x=>x[KEY]===selectedId);
                if (r) markRow(r,"celeste");
              }}
              className="px-3 py-1.5 rounded-lg border-2"
              style={{ borderColor: MARKS.celeste.border, color: MARKS.celeste.border }}
            >
              Marcar Para implementar
            </button>
            <button
              onClick={()=>{
                const r = rows.find(x=>x[KEY]===selectedId);
                if (r) markRow(r,"");
              }}
              className="px-3 py-1.5 rounded-lg border-2 border-neutral-400 text-neutral-600"
            >
              Quitar marca
            </button>
          </div>
        )}
      </div>

      {/* Filtros (checkboxes) */}
      <div className="px-4 py-3 border-b grid gap-4 md:grid-cols-2">
        {/* ESTADO */}
        <div>
          <div className="text-sm font-medium mb-2">Estado</div>
          <div className="rounded-lg border-2 p-2" style={{ borderColor:"#398FFF" }}>
            {opcionesEstado.map(o => (
              <label key={o} className="flex items-center gap-2 text-sm py-1">
                <input
                  type="checkbox"
                  checked={fEstado.includes(o)}
                  onChange={()=>toggleSel(setFEstado)(o)}
                />
                <span>{o}</span>
              </label>
            ))}
            {opcionesEstado.length === 0 && <div className="text-xs text-slate-400">Sin opciones</div>}
          </div>
        </div>

        {/* PRIORIDAD */}
        <div>
          <div className="text-sm font-medium mb-2">Prioridad</div>
          <div className="rounded-lg border-2 p-2" style={{ borderColor:"#398FFF" }}>
            {opcionesPrioridad.map(o => (
              <label key={o} className="flex items-center gap-2 text-sm py-1">
                <input
                  type="checkbox"
                  checked={fPrioridad.includes(o)}
                  onChange={()=>toggleSel(setFPrioridad)(o)}
                />
                <span>{o}</span>
              </label>
            ))}
            {opcionesPrioridad.length === 0 && <div className="text-xs text-slate-400">Sin opciones</div>}
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className={`overflow-auto ${collapsed ? "max-h-[60vh]" : ""}`}>
        <table className="min-w-full text-sm">
          <thead style={{ background: "#E3F2FD" }}>
            <tr>
              <th className="px-3 py-2 text-xs font-semibold uppercase">Identificador de Caso</th>
              <th className="px-3 py-2 text-xs font-semibold uppercase">Asunto</th>
              <th className="px-3 py-2 text-xs font-semibold uppercase">Estado</th>
              <th className="px-3 py-2 text-xs font-semibold uppercase">Fecha</th>
              <th className="px-3 py-2 text-xs font-semibold uppercase">Prioridad</th>
              <th className="px-3 py-2 text-xs font-semibold uppercase">TIPO DE IMPACTO</th>
              <th className="px-3 py-2 text-xs font-semibold uppercase">IMPACTO OPERATIVO</th>
              <th className="px-3 py-2 text-xs font-semibold uppercase">Estado Heber</th>
              <th className="px-3 py-2 text-xs font-semibold uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r, idx) => {
              const isSelected = selectedId === r[KEY];
              const mark = r["Marca"] || "";
              const color = mark ? MARKS[mark] : null;

              return (
                <tr
                  key={`${r[KEY]}-${idx}`}
                  onClick={() => setSelectedId(isSelected ? null : r[KEY])}
                  className="border-b last:border-0"
                  style={{
                    background: color ? color.bg : "white",
                    outline: isSelected ? `2px solid ${color?.border || "#398FFF"}` : "none",
                    cursor: "pointer"
                  }}
                  title="Clic para seleccionar"
                >
                  <td className="px-3 py-2">{r["Identificador de Caso"]}</td>
                  <td className="px-3 py-2">{r["Asunto"]}</td>
                  <td className="px-3 py-2">{r["Estado"]}</td>
                  <td className="px-3 py-2">{r["Fecha"]}</td>
                  <td className="px-3 py-2">{r["Prioridad"]}</td>

                  {/* TIPO DE IMPACTO */}
                  <td className="px-3 py-2">
                    {editId === r[KEY] ? (
                      <input
                        className="w-full rounded-md border-2 px-2 py-1"
                        style={{ borderColor:"#398FFF" }}
                        value={draft["TIPO DE IMPACTO"]}
                        onChange={(e)=>setDraft(d => ({ ...d, "TIPO DE IMPACTO": e.target.value }))}
                        onClick={(e)=>e.stopPropagation()}
                        placeholder="Ej.: Alto / Medio / Bajo…"
                      />
                    ) : (
                      r["TIPO DE IMPACTO"] ? r["TIPO DE IMPACTO"] : <span className="text-neutral-400">—</span>
                    )}
                  </td>

                  {/* IMPACTO OPERATIVO */}
                  <td className="px-3 py-2">
                    {editId === r[KEY] ? (
                      <input
                        className="w-full rounded-md border-2 px-2 py-1"
                        style={{ borderColor:"#398FFF" }}
                        value={draft["IMPACTO OPERATIVO"]}
                        onChange={(e)=>setDraft(d => ({ ...d, "IMPACTO OPERATIVO": e.target.value }))}
                        onClick={(e)=>e.stopPropagation()}
                        placeholder="Descripción breve del impacto"
                      />
                    ) : (
                      r["IMPACTO OPERATIVO"] ? r["IMPACTO OPERATIVO"] : <span className="text-neutral-400">—</span>
                    )}
                  </td>

                  {/* ESTADO HEBER */}
                  <td className="px-3 py-2">
                    {editId === r[KEY] ? (
                      <input
                        className="w-full rounded-md border-2 px-2 py-1"
                        style={{ borderColor:"#398FFF" }}
                        value={draft["Estado Heber"]}
                        onChange={(e)=>setDraft(d => ({ ...d, "Estado Heber": e.target.value }))}
                        onClick={(e)=>e.stopPropagation()}
                        placeholder="Escribir libremente…"
                      />
                    ) : (
                      r["Estado Heber"] ? r["Estado Heber"] : <span className="text-neutral-400">—</span>
                    )}
                  </td>

                  {/* Acciones */}
                  <td className="px-3 py-2" onClick={(e)=>e.stopPropagation()}>
                    {editId === r[KEY] ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={()=>saveDraft(r)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white"
                          style={{ background:"#398FFF" }}
                        >
                          <Save className="w-4 h-4" /> Guardar
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border-2"
                          style={{ borderColor:"#fd006e", color:"#fd006e" }}
                        >
                          <X className="w-4 h-4" /> Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={()=>startEdit(r)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border-2"
                          style={{ borderColor:"#398FFF", color:"#398FFF" }}
                        >
                          <Pencil className="w-4 h-4" /> Editar
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm">
                  Sin resultados (ajustá filtros).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {msg && (
        <div className="m-3 rounded-xl border-2 border-[#fd006e] text-[#fd006e] bg-white px-3 py-2 text-sm">
          {msg}
        </div>
      )}
    </div>
  );
}



