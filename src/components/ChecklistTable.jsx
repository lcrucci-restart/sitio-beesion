import React, { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Save, X, Trash2, ChevronRight } from "lucide-react";

const STORAGE_KEY = "checklist_v1";

const MESA_OPTS = ["Nivel 1", "Nivel 2", "Nivel 3"];

// Paleta de estados (solo tus colores + pasteles de fondo)
const STATUS = {
  rojo:     { label: "Urgente",              bg: "#FFE5E9", border: "#fd006e", text: "#b20049" },
  naranja:  { label: "Importante",           bg: "#FFF3E0", border: "#ff8c00", text: "#9a5100" },
  verde:    { label: "Solucionado (mantener)", bg: "#E8F5E9", border: "#43A047", text: "#1b5e20" },
  amarillo: { label: "En prueba",            bg: "#FFFDE7", border: "#FBC02D", text: "#8d6e00" },
  celeste:  { label: "A implementar",        bg: "#E3F2FD", border: "#398FFF", text: "#1c4e9a" },
};

const emptyRow = () => ({
  id: crypto?.randomUUID?.() ?? String(Date.now()),
  tema: "",
  responsable: "",
  mesa: "Nivel 1",
  analista: "",
  invgate: "",
  detalle: "",
  comentarios: "",
  fechaEntrega: "",
  estado: null, // 'rojo'|'naranja'|'verde'|'amarillo'|'celeste'|null
});

export default function ChecklistTable() {
  const [rows, setRows] = useState([]);
  const [draft, setDraft] = useState(emptyRow()); // formulario alta
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [msg, setMsg] = useState(null); // feedback simple

  // cargar / guardar
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      setRows(raw ? JSON.parse(raw) : []);
    } catch {
      setRows([]);
    }
  }, []);
  const save = (next) => {
    setRows(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  // alta
  const addRow = (e) => {
    e.preventDefault();
    if (!draft.tema.trim()) return toast("Completá el campo Tema.");
    if (draft.invgate !== "" && !/^\d+$/.test(String(draft.invgate))) {
      return toast("InvGate debe ser numérico.");
    }
    const next = [{ ...draft, invgate: draft.invgate ? String(draft.invgate) : "" }, ...rows];
    save(next);
    setDraft(emptyRow());
    toast("Fila agregada.");
  };

  // edición
  const startEdit = (row) => {
    setEditingId(row.id);
    setEditDraft({ ...row });
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft({});
  };
  const commitEdit = () => {
    if (!editDraft.tema.trim()) return toast("Completá el campo Tema.");
    if (editDraft.invgate !== "" && !/^\d+$/.test(String(editDraft.invgate))) {
      return toast("InvGate debe ser numérico.");
    }
    const next = rows.map((r) => (r.id === editingId ? { ...editDraft, invgate: editDraft.invgate ? String(editDraft.invgate) : "" } : r));
    save(next);
    setEditingId(null);
    setEditDraft({});
    toast("Cambios guardados.");
  };

  const removeRow = (id) => {
    if (!confirm("¿Eliminar esta fila?")) return;
    const next = rows.filter((r) => r.id !== id);
    save(next);
    if (selectedId === id) setSelectedId(null);
  };

  // estado/color por fila
  const markStatus = (key) => {
    if (!selectedId) return toast("Seleccioná una fila primero.");
    const next = rows.map((r) =>
      r.id === selectedId ? { ...r, estado: key } : r
    );
    save(next);
  };
  const clearStatus = () => {
    if (!selectedId) return toast("Seleccioná una fila primero.");
    const next = rows.map((r) =>
      r.id === selectedId ? { ...r, estado: null } : r
    );
    save(next);
  };

  const toast = (text) => {
    setMsg(text);
    setTimeout(() => setMsg(null), 2500);
  };

  // orden simple: urgentes/important arriba, después por fecha (si la hay)
  const sorted = useMemo(() => {
    const rank = (s) =>
      s === "rojo" ? 0 :
      s === "naranja" ? 1 :
      s === "amarillo" ? 2 :
      s === "celeste" ? 3 :
      s === "verde" ? 4 : 5;
    return [...rows].sort((a, b) => {
      const ra = rank(a.estado), rb = rank(b.estado);
      if (ra !== rb) return ra - rb;
      const da = a.fechaEntrega || "", db = b.fechaEntrega || "";
      return da.localeCompare(db);
    });
  }, [rows]);

  // UI helpers
  const cellCls = "px-3 py-2 align-top";
  const thCls = "px-3 py-2 text-xs font-semibold uppercase tracking-wide";

  return (
    <div className="mt-6">
      {/* Referencias */}
      <div className="rounded-2xl border-2 border-[#398FFF] bg-white p-4">
        <div className="text-lg font-semibold mb-2">Referencias</div>
        <div className="flex flex-wrap gap-3">
          {Object.entries(STATUS).map(([key, s]) => (
            <div key={key} className="inline-flex items-center gap-2">
              <span
                className="inline-block w-4 h-4 rounded-sm"
                style={{ backgroundColor: s.bg, outline: `2px solid ${s.border}` }}
                title={s.label}
              />
              <span className="text-sm" style={{ color: s.text }}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Toolbar de estado por fila */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="text-sm">Acciones sobre la fila seleccionada:</div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => markStatus("rojo")}     className="px-3 py-1.5 rounded-lg border-2" style={{ borderColor: STATUS.rojo.border, color: STATUS.rojo.border }}>Marcar Urgente</button>
          <button onClick={() => markStatus("naranja")}  className="px-3 py-1.5 rounded-lg border-2" style={{ borderColor: STATUS.naranja.border, color: STATUS.naranja.border }}>Marcar Importante</button>
          <button onClick={() => markStatus("amarillo")} className="px-3 py-1.5 rounded-lg border-2" style={{ borderColor: STATUS.amarillo.border, color: STATUS.amarillo.border }}>En prueba</button>
          <button onClick={() => markStatus("celeste")}  className="px-3 py-1.5 rounded-lg border-2" style={{ borderColor: STATUS.celeste.border, color: STATUS.celeste.border }}>A implementar</button>
          <button onClick={() => markStatus("verde")}    className="px-3 py-1.5 rounded-lg border-2" style={{ borderColor: STATUS.verde.border, color: STATUS.verde.border }}>Solucionado</button>
          <button onClick={clearStatus} className="px-3 py-1.5 rounded-lg border-2 border-neutral-400 text-neutral-600">Quitar marca</button>
        </div>
      </div>

      {/* Mensaje */}
      {msg && (
        <div className="mt-3 rounded-xl border-2 border-[#fd006e] text-[#fd006e] bg-white px-3 py-2 text-sm">
          {msg}
        </div>
      )}

      {/* Formulario de alta */}
      <form onSubmit={addRow} className="mt-6 rounded-2xl border-2 border-[#398FFF] bg-white p-4">
        <div className="text-sm font-semibold mb-3" style={{ color: "#398FFF" }}>Agregar ítem</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <input className="rounded-xl border-2 px-3 py-2" style={{ borderColor: "#398FFF" }} placeholder="Tema *"
            value={draft.tema} onChange={(e)=>setDraft({...draft, tema: e.target.value})} />
          <input className="rounded-xl border-2 px-3 py-2" style={{ borderColor: "#398FFF" }} placeholder="Responsable"
            value={draft.responsable} onChange={(e)=>setDraft({...draft, responsable: e.target.value})} />
          <select className="rounded-xl border-2 px-3 py-2" style={{ borderColor: "#398FFF" }}
            value={draft.mesa} onChange={(e)=>setDraft({...draft, mesa: e.target.value})}>
            {MESA_OPTS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <input className="rounded-xl border-2 px-3 py-2" style={{ borderColor: "#398FFF" }} placeholder="Analista"
            value={draft.analista} onChange={(e)=>setDraft({...draft, analista: e.target.value})} />
          <input className="rounded-xl border-2 px-3 py-2" style={{ borderColor: "#398FFF" }} placeholder="InvGate (número)"
            inputMode="numeric" pattern="\d*" value={draft.invgate}
            onChange={(e)=>{ const v=e.target.value; if (/^\d*$/.test(v)) setDraft({...draft, invgate: v}); }} />
          <input type="date" className="rounded-xl border-2 px-3 py-2" style={{ borderColor: "#398FFF" }}
            value={draft.fechaEntrega} onChange={(e)=>setDraft({...draft, fechaEntrega: e.target.value})} />
          <textarea className="rounded-xl border-2 px-3 py-2 sm:col-span-2" rows={2} style={{ borderColor: "#398FFF" }} placeholder="Detalle"
            value={draft.detalle} onChange={(e)=>setDraft({...draft, detalle: e.target.value})} />
          <textarea className="rounded-xl border-2 px-3 py-2" rows={2} style={{ borderColor: "#398FFF" }} placeholder="Comentarios"
            value={draft.comentarios} onChange={(e)=>setDraft({...draft, comentarios: e.target.value})} />
        </div>
        <div className="mt-3">
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-white" style={{ background: "#398FFF" }}>
            <Plus className="w-4 h-4" /> Agregar
          </button>
        </div>
      </form>

      {/* Tabla */}
      <div className="mt-6 overflow-auto rounded-2xl border-2 border-[#398FFF] bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-[#E3F2FD]">
            <tr>
              <th className={thCls}>Tema</th>
              <th className={thCls}>Responsable</th>
              <th className={thCls}>Mesa</th>
              <th className={thCls}>Analista</th>
              <th className={thCls}>InvGate</th>
              <th className={thCls}>Detalle</th>
              <th className={thCls}>Comentarios</th>
              <th className={thCls}>Fecha de Entrega</th>
              <th className={thCls}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const isSelected = r.id === selectedId;
              const s = r.estado ? STATUS[r.estado] : null;
              return (
                <tr key={r.id}
                    onClick={()=> setSelectedId(isSelected ? null : r.id)}
                    style={{
                      background: s ? s.bg : "white",
                      outline: isSelected ? `2px solid ${s?.border || "#398FFF"}` : "none",
                      cursor: "pointer"
                    }}>
                  {editingId === r.id ? (
                    <>
                      <td className={cellCls}>
                        <input className="w-full rounded-md border-2 px-2 py-1" style={{ borderColor: "#398FFF" }}
                          value={editDraft.tema} onChange={(e)=>setEditDraft({...editDraft, tema: e.target.value})} />
                      </td>
                      <td className={cellCls}>
                        <input className="w-full rounded-md border-2 px-2 py-1" style={{ borderColor: "#398FFF" }}
                          value={editDraft.responsable} onChange={(e)=>setEditDraft({...editDraft, responsable: e.target.value})} />
                      </td>
                      <td className={cellCls}>
                        <select className="w-full rounded-md border-2 px-2 py-1" style={{ borderColor: "#398FFF" }}
                          value={editDraft.mesa} onChange={(e)=>setEditDraft({...editDraft, mesa: e.target.value})}>
                          {MESA_OPTS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </td>
                      <td className={cellCls}>
                        <input className="w-full rounded-md border-2 px-2 py-1" style={{ borderColor: "#398FFF" }}
                          value={editDraft.analista} onChange={(e)=>setEditDraft({...editDraft, analista: e.target.value})} />
                      </td>
                      <td className={cellCls}>
                        <input className="w-full rounded-md border-2 px-2 py-1" style={{ borderColor: "#398FFF" }}
                          inputMode="numeric" pattern="\d*" value={editDraft.invgate}
                          onChange={(e)=>{ const v=e.target.value; if (/^\d*$/.test(v)) setEditDraft({...editDraft, invgate: v}); }} />
                      </td>
                      <td className={cellCls}>
                        <textarea rows={2} className="w-full rounded-md border-2 px-2 py-1" style={{ borderColor: "#398FFF" }}
                          value={editDraft.detalle} onChange={(e)=>setEditDraft({...editDraft, detalle: e.target.value})} />
                      </td>
                      <td className={cellCls}>
                        <textarea rows={2} className="w-full rounded-md border-2 px-2 py-1" style={{ borderColor: "#398FFF" }}
                          value={editDraft.comentarios} onChange={(e)=>setEditDraft({...editDraft, comentarios: e.target.value})} />
                      </td>
                      <td className={cellCls}>
                        <input type="date" className="w-full rounded-md border-2 px-2 py-1" style={{ borderColor: "#398FFF" }}
                          value={editDraft.fechaEntrega} onChange={(e)=>setEditDraft({...editDraft, fechaEntrega: e.target.value})} />
                      </td>
                      <td className={cellCls}>
                        <div className="flex items-center gap-2">
                          <button onClick={commitEdit} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white" style={{ background: "#398FFF" }}>
                            <Save className="w-4 h-4" /> Guardar
                          </button>
                          <button onClick={cancelEdit} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border-2" style={{ borderColor: "#fd006e", color: "#fd006e" }}>
                            <X className="w-4 h-4" /> Cancelar
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className={cellCls}><div className="font-medium">{r.tema}</div></td>
                      <td className={cellCls}>{r.responsable}</td>
                      <td className={cellCls}>{r.mesa}</td>
                      <td className={cellCls}>{r.analista}</td>
                      <td className={cellCls}>{r.invgate}</td>
                      <td className={cellCls}>{r.detalle}</td>
                      <td className={cellCls}>{r.comentarios}</td>
                      <td className={cellCls}>{r.fechaEntrega}</td>
                      <td className={cellCls}>
                        <div className="flex items-center gap-2">
                          <button onClick={(e)=>{ e.stopPropagation(); startEdit(r); }}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border-2"
                                  style={{ borderColor: "#398FFF", color: "#398FFF" }}>
                            <Pencil className="w-4 h-4" /> Editar
                          </button>
                          <button onClick={(e)=>{ e.stopPropagation(); removeRow(r.id); }}
                                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border-2"
                                  style={{ borderColor: "#fd006e", color: "#fd006e" }}>
                            <Trash2 className="w-4 h-4" /> Eliminar
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-sm">
                  No hay ítems aún.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Hint */}
      <div className="mt-3 text-xs text-neutral-600">
        Tip: hacé clic en una fila para seleccionarla y luego usá los botones de “Acciones” para marcarla con un color.
      </div>
    </div>
  );
}
