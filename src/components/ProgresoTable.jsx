// src/components/ProgresoTable.jsx
import React, { useEffect, useMemo, useState } from "react";
import { RefreshCcw, Save, X, XCircle, ChevronDown, ChevronRight } from "lucide-react";
import { hasGoogle, initTokenClient, ensureToken, isSignedIn } from "../lib/googleAuth";

const SHEET_ID =
  import.meta.env.VITE_PROG_SHEET_ID ||
  import.meta.env.VITE_SHEETS_SPREADSHEET_ID; // fallback al ID general

const SHEET_TAB = import.meta.env.VITE_PROG_SHEET_TAB || "Abiertos";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

// Encabezados esperados en Abiertos (exactos como en la hoja)
const HDR = {
  nro:         "Nro",
  asunto:      "Asunto",
  usuario:     "Usuario",
  descripcion: "Descripción",
  fecha:       "Fecha de creación",
  aging:       "Aging",
  prioridad:   "Prioridad",
  estado:      "Estado",
  mesa:        "Mesa",
  agente:      "Agente asignado",
  modulo:      "Módulo",
  tipo:        "Tipo",              // se usa para separar Evolutivos, NO se muestra
  ticketN3:    "Ticket N3",         // editable
  comentario:  "Comentario",        // editable
  marca:       "Marca",             // celeste/amarillo/""
  etiqueta:    "Etiqueta",          // nombre libre
  etqMadre:    "Etiqueta Madre",    // "Sí"/""
  etqColor:    "Etiqueta Color",    // color lógico
  escalamiento:"Escalamiento",      // manual: "Posible N3" / ""
};

const MARKS = {
  amarillo: {
    label: "Pruebas",
    bg: "#FFFDE7",
    border: "#FBC02D",
    text: "#8d6e00",
  },
  celeste:  {
    label: "Deploy",
    bg: "#E3F2FD",
    border: "#398FFF",
    text: "#1c4e9a",
  },
};

// Paleta de colores para etiquetas
const LABEL_PALETTE = {
  "violeta":       { bg: "#F1E7FF", border:"#7E57C2", text:"#4A2C8C" },
  "rosa":          { bg: "#FDE7F3", border:"#E91E63", text:"#8A1846" },
  "verde-oscuro":  { bg: "#E6F4EA", border:"#2E7D32", text:"#1B5E20" },
  "verde-claro":   { bg: "#ECFDF5", border:"#43A047", text:"#2E7D32" },
  "naranja":       { bg: "#FFF3E0", border:"#FB8C00", text:"#EF6C00" },
  "azul-oscuro":   { bg: "#E3F2FD", border:"#1E3A8A", text:"#1E3A8A" },
  "gris":          { bg: "#F5F5F5", border:"#9E9E9E", text:"#424242" },
};

const PALETTE_KEYS = Object.keys(LABEL_PALETTE);

// normaliza strings
const norm = (s = "") =>
  s.toString().trim().toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
const uniq = (arr) => Array.from(new Set(arr.filter(Boolean))).sort((a,b)=>a.localeCompare(b));
const isEvolutivo = (row) => norm(row.tipo) === "pedido de cambio";
const isTrue = (v) => /^s[íi]?|true|1|x|y$/i.test(String(v||"").trim());
const normColor = (s="") => norm(s).replace(/\s+/g,"-");

// color hash por nombre (si no hay columna de color)
const hashPaletteKey = (name) => {
  const code = Math.abs(name.split("").reduce((a,c)=>a+c.charCodeAt(0),0));
  return PALETTE_KEYS[code % PALETTE_KEYS.length];
};

export default function ProgresoTable() {
  const [ready, setReady]        = useState(isSignedIn());
  const [loading, setLoading]    = useState(false);
  const [msg, setMsg]            = useState(null);
  const [collapsed, setCollapsed]= useState(true);

  const [showHiddenCols, setShowHiddenCols] = useState(false);

  // vista: invgates normales vs evolutivos
  const [dataset, setDataset]    = useState("inv"); // "inv" | "evo"

  const [tabName, setTabName]    = useState(SHEET_TAB);

  const [rows, setRows]          = useState([]); // objetos mapeados por headers
  const [selectedId, setSelectedId] = useState(null);

  // filtros con select (uno por campo)
  const [fEstado, setFEstado]       = useState("");
  const [fPrioridad, setFPrioridad] = useState("");
  const [fMesa, setFMesa]           = useState("");

  // edición por fila (Ticket N3 + Comentario), sin botón "Editar": se dispara al tocar la celda
  const [editId, setEditId]     = useState(null);
  const [draft, setDraft]       = useState({ ticketN3: "", comentario: "" });

  // asignación a etiqueta
  const [assignRowId, setAssignRowId] = useState(null);
  const [assignTo, setAssignTo]       = useState("");

  // expandibles Etiquetas
  const [expandedLabels, setExpandedLabels] = useState(()=> new Set());

  // modal para crear etiqueta madre
  const [labelModal, setLabelModal] = useState({
    open: false,
    row: null,
    name: "",
    colorKey: "violeta",
  });

  const toast = (t) => { setMsg(t); setTimeout(()=>setMsg(null), 2200); };

  // auth
  const connect = async () => {
    try {
      if (!hasGoogle()) return alert("Falta Google Identity Services.");
      initTokenClient();
      await ensureToken();
      setReady(true);
    } catch (e) { console.error(e); alert("No se pudo conectar a Google."); }
  };

  // gid -> nombre de pestaña
  useEffect(() => {
    let stop = false;
    const resolveTab = async () => {
      const gid = import.meta.env.VITE_PROG_SHEET_GID;
      if (tabName || !SHEET_ID || !gid) return;
      try {
        await ensureToken();
        const meta = await fetch(
          `${API}/${SHEET_ID}?fields=sheets.properties`,
          { headers: { Authorization: `Bearer ${await ensureToken()}` } }
        ).then(r => r.json());
        const match = meta?.sheets?.find(s => String(s?.properties?.sheetId) === String(gid));
        if (match && !stop) setTabName(match.properties.title);
      } catch (e) { console.error("No pude resolver tab por gid:", e); }
    };
    resolveTab();
    return () => { stop = true; };
  }, [tabName]);

  // carga
  const load = async () => {
    if (!SHEET_ID) return;
    const activeTab = tabName || SHEET_TAB;
    const gid = import.meta.env.VITE_PROG_SHEET_GID;
    if (!activeTab && gid) return;

    setLoading(true);
    try {
      await ensureToken();
      const quotedTab = `'${(activeTab).replace(/'/g, "''")}'`;
      const range = `${quotedTab}!A1:ZZ20000`;
      const res = await fetch(`${API}/${SHEET_ID}/values/${encodeURIComponent(range)}`, {
        headers: { Authorization: `Bearer ${await ensureToken()}` },
      });
      const data = await res.json();
      const values = data?.values || [];
      if (!values.length) { setRows([]); return; }

      const hdr = values[0].map(h => (h||"").trim());
      const idx = (name) => hdr.findIndex(h => h.toLowerCase() === name.toLowerCase());

      const i = {
        nro:         idx(HDR.nro),
        asunto:      idx(HDR.asunto),
        usuario:     idx(HDR.usuario),
        descripcion: idx(HDR.descripcion),
        fecha:       idx(HDR.fecha),
        aging:       idx(HDR.aging),
        prioridad:   idx(HDR.prioridad),
        estado:      idx(HDR.estado),
        mesa:        idx(HDR.mesa),
        agente:      idx(HDR.agente),
        modulo:      idx(HDR.modulo),
        tipo:        idx(HDR.tipo),
        ticketN3:    idx(HDR.ticketN3),
        comentario:  idx(HDR.comentario),
        marca:       idx(HDR.marca),
        etiqueta:    idx(HDR.etiqueta),
        etqMadre:    idx(HDR.etqMadre),
        etqColor:    idx(HDR.etqColor),
        escalamiento:idx(HDR.escalamiento),
      };

      const out = values.slice(1)
        .filter(r => r && r.some(c => String(c).trim() !== "")) // evita filas vacías
        .map((r, k) => ({
          _row:        k + 2,
          id:          i.nro       >=0 ? (r[i.nro]       ?? "") : "",
          asunto:      i.asunto    >=0 ? (r[i.asunto]    ?? "") : "",
          usuario:     i.usuario   >=0 ? (r[i.usuario]   ?? "") : "",
          descripcion: i.descripcion>=0 ? (r[i.descripcion]?? "") : "",
          fecha:       i.fecha     >=0 ? (r[i.fecha]     ?? "") : "",
          aging:       i.aging     >=0 ? (r[i.aging]     ?? "") : "",
          prioridad:   i.prioridad >=0 ? (r[i.prioridad] ?? "") : "",
          estado:      i.estado    >=0 ? (r[i.estado]    ?? "") : "",
          mesa:        i.mesa      >=0 ? (r[i.mesa]      ?? "") : "",
          agente:      i.agente    >=0 ? (r[i.agente]    ?? "") : "",
          modulo:      i.modulo    >=0 ? (r[i.modulo]    ?? "") : "",
          tipo:        i.tipo      >=0 ? (r[i.tipo]      ?? "") : "",
          ticketN3:    i.ticketN3  >=0 ? (r[i.ticketN3]  ?? "") : "",
          comentario:  i.comentario>=0 ? (r[i.comentario]?? "") : "",
          marca:       i.marca     >=0 ? (r[i.marca]     ?? "") : "",
          etiqueta:    i.etiqueta  >=0 ? (r[i.etiqueta]  ?? "") : "",
          etqMadre:    i.etqMadre  >=0 ? (r[i.etqMadre]  ?? "") : "",
          etqColor:    i.etqColor  >=0 ? (r[i.etqColor]  ?? "") : "",
          escalamiento:i.escalamiento>=0 ? (r[i.escalamiento] ?? "") : "",
          _colIndex:   i,
        }));

      setRows(out);
    } catch (e) {
      console.error(e);
      toast("No pude leer la hoja. Revisá permisos/ID/pestaña.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready && (tabName || SHEET_TAB || !import.meta.env.VITE_PROG_SHEET_GID)) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, tabName, SHEET_TAB]);

  // A1 helper
  const toA1 = (idx0) => {
    let s="", n=idx0+1;
    while (n>0) { const r=(n-1)%26; s=String.fromCharCode(65+r)+s; n=Math.floor((n-1)/26); }
    return s;
  };

  // escritura a Sheets (batch)
  const writeCells = async (cells) => {
    const activeTab = tabName || SHEET_TAB;
    for (const c of cells) {
      if (typeof c.colIndex0 !== "number" || c.colIndex0 < 0) {
        throw new Error(`Índice de columna inválido para escritura: ${String(c.colIndex0)}`);
      }
    }
    const data = cells.map(c => ({
      range: `'${activeTab.replace(/'/g,"''")}'!${toA1(c.colIndex0)}${c.rowNumber}`,
      values: [[c.value]],
      majorDimension: "ROWS",
    }));
    const body = { valueInputOption: "USER_ENTERED", data };
    const res = await fetch(`${API}/${SHEET_ID}/values:batchUpdate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${await ensureToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const t = await res.text().catch(()=> "");
      throw new Error(`Sheets write failed: ${t}`);
    }
  };

  // dataset base según vista (separamos por Tipo, no mostramos la columna)
  const base = useMemo(() => {
    return dataset === "evo"
      ? rows.filter(isEvolutivo)
      : rows.filter(r => !isEvolutivo(r));
  }, [rows, dataset]);

  // filtros (sobre dataset activo)
  const optsEstado    = useMemo(()=>uniq(base.map(r=>r.estado)),    [base]);
  const optsPrioridad = useMemo(()=>uniq(base.map(r=>r.prioridad)), [base]);
  const optsMesa      = useMemo(()=>uniq(base.map(r=>r.mesa)),      [base]);

  // aplicar filtros (select simple)
  const filtered = useMemo(() => {
    let data = [...base];
    if (fEstado)    data = data.filter(r => r.estado === fEstado);
    if (fPrioridad) data = data.filter(r => r.prioridad === fPrioridad);
    if (fMesa)      data = data.filter(r => r.mesa === fMesa);
    return data;
  }, [base, fEstado, fPrioridad, fMesa]);

  const clearFilters = () => {
    setFEstado("");
    setFPrioridad("");
    setFMesa("");
  };

  // edición Ticket N3 / Comentario (activada al tocar la celda)
  const startEdit = (r) => {
    setEditId(r.id);
    setDraft({ ticketN3: r.ticketN3 || "", comentario: r.comentario || "" });
  };
  const cancelEdit = () => { setEditId(null); setDraft({ ticketN3:"", comentario:"" }); };
  const saveEdit = async (r) => {
    try {
      const i = r._colIndex;
      const cells = [];
      if (i.ticketN3   >= 0) cells.push({ rowNumber: r._row, colIndex0: i.ticketN3,   value: draft.ticketN3 });
      if (i.comentario >= 0) cells.push({ rowNumber: r._row, colIndex0: i.comentario, value: draft.comentario });
      if (!cells.length) return toast("No encuentro columnas editables en la hoja.");
      await writeCells(cells);
      setRows(prev => prev.map(x => x.id===r.id ? { ...x, ticketN3: draft.ticketN3, comentario: draft.comentario } : x));
      cancelEdit();
      toast("Guardado en Sheets ✓");
    } catch (e) { console.error(e); toast("No pude guardar. Revisá permisos."); }
  };

  // marcas por fila (amarillo/celeste)
  const markRow = async (r, kind /* "amarillo"|"celeste"|"" */) => {
    try {
      const i = r._colIndex;
      if (typeof i.marca !== "number" || i.marca < 0) {
        return toast("No encuentro la columna 'Marca' en la hoja. Verificá el encabezado exacto.");
      }
      await writeCells([{ rowNumber: r._row, colIndex0: i.marca, value: kind }]);
      setRows(prev => prev.map(x => x.id===r.id ? { ...x, marca: kind } : x));
      toast(kind ? "Marcado ✓" : "Marca quitada ✓");
    } catch (e) {
      console.error(e);
      toast("No pude actualizar la marca.");
    }
  };

  // Escalamiento (Posible N3)
  const toggleEscalamiento = async (r) => {
    try {
      const i = r._colIndex;
      if (typeof i.escalamiento !== "number" || i.escalamiento < 0) {
        return toast("No encuentro la columna 'Escalamiento' en la hoja.");
      }
      const current = String(r.escalamiento || "").trim();
      const nextVal = current === "Posible N3" ? "" : "Posible N3";
      await writeCells([{ rowNumber: r._row, colIndex0: i.escalamiento, value: nextVal }]);
      setRows(prev => prev.map(x => x.id===r.id ? { ...x, escalamiento: nextVal } : x));
      toast(nextVal ? "Marcado como posible N3 ✓" : "Escalamiento limpiado ✓");
    } catch (e) {
      console.error(e);
      toast("No pude actualizar Escalamiento.");
    }
  };

  // ======== Etiquetas ========

  // dueñas de etiqueta (madres)
  const labelsAll = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const r of rows) {
      const name = (r.etiqueta || "").trim();
      if (!name) continue;
      if (!isTrue(r.etqMadre)) continue;
      if (seen.has(name)) continue;
      out.push({
        name,
        ownerId: r.id,
        colorKey: LABEL_PALETTE[normColor(r.etqColor || "")] ? normColor(r.etqColor) : null,
        asunto: r.asunto || ""
      });
      seen.add(name);
    }
    return out;
  }, [rows]);

  // estilo de una etiqueta por nombre
  const getLabelStyle = (labelName) => {
    const n = (labelName || "").trim();
    if (!n) return null;
    const owner = labelsAll.find(l => l.name === n);
    const key = owner?.colorKey || hashPaletteKey(n);
    return LABEL_PALETTE[key];
  };

  // crear etiqueta madre (usando modal)
  const createLabelOwner = async (row, name, colorKey) => {
    try {
      const i = row._colIndex;
      if (typeof i.etqMadre !== "number" || i.etqMadre < 0) return toast("Falta 'Etiqueta Madre' en la hoja.");
      if (typeof i.etiqueta !== "number" || i.etiqueta < 0) return toast("Falta 'Etiqueta' en la hoja.");

      const cleanName = (name || "").trim();
      if (!cleanName) return;

      const key = LABEL_PALETTE[colorKey] ? colorKey : "violeta";

      // colisión de dueña con mismo nombre
      const clash = labelsAll.find(l => l.name === cleanName && l.ownerId !== row.id);
      if (clash) return toast(`Ya existe etiqueta "${cleanName}" definida por ${clash.ownerId}.`);

      const cells = [];
      cells.push({ rowNumber: row._row, colIndex0: i.etqMadre, value: "Sí" });
      cells.push({ rowNumber: row._row, colIndex0: i.etiqueta, value: cleanName });
      if (typeof i.etqColor === "number" && i.etqColor >= 0) {
        cells.push({ rowNumber: row._row, colIndex0: i.etqColor, value: key });
      }
      await writeCells(cells);

      setRows(prev => prev.map(x => x.id===row.id ? { ...x, etqMadre:"Sí", etiqueta:cleanName, etqColor:key } : x));
      toast("Etiqueta creada ✓");
    } catch (e) {
      console.error(e);
      toast("No pude actualizar la etiqueta.");
    }
  };

  // quitar etiqueta madre y limpiar hijas
  const removeLabelOwner = async (row) => {
    try {
      const i = row._colIndex;
      if (typeof i.etqMadre !== "number" || i.etqMadre < 0) return toast("Falta 'Etiqueta Madre' en la hoja.");
      if (typeof i.etiqueta !== "number" || i.etiqueta < 0) return toast("Falta 'Etiqueta' en la hoja.");

      const cells = [];
      const current = (row.etiqueta || "").trim();

      cells.push({ rowNumber: row._row, colIndex0: i.etqMadre, value: "" });

      if (current) {
        for (const r of rows) {
          if ((r.etiqueta || "").trim() === current) {
            const ci = r._colIndex;
            if (typeof ci.etiqueta === "number" && ci.etiqueta >= 0) {
              cells.push({ rowNumber: r._row, colIndex0: ci.etiqueta, value: "" });
            }
            if (typeof ci.etqColor === "number" && ci.etqColor >= 0) {
              cells.push({ rowNumber: r._row, colIndex0: ci.etqColor, value: "" });
            }
          }
        }
      }

      await writeCells(cells);

      setRows(prev => prev.map(r => {
        if (r.id === row.id) return { ...r, etqMadre:"", etiqueta:"", etqColor:"" };
        if ((r.etiqueta || "").trim() === current) return { ...r, etiqueta:"", etqColor:r.etqColor };
        return r;
      }));
      toast("Etiqueta eliminada y desasignada de sus filas ✓");
    } catch (e) {
      console.error(e);
      toast("No pude actualizar la etiqueta.");
    }
  };

  // asignar a etiqueta existente
  const assignToLabel = async (row, labelName) => {
    try {
      const i = row._colIndex;
      if (typeof i.etiqueta !== "number" || i.etiqueta < 0) return toast("Falta 'Etiqueta' en la hoja.");
      const name = (labelName || "").trim();
      if (!name) return;

      const owner = labelsAll.find(l => l.name === name);
      if (!owner) return toast(`No existe etiqueta "${name}". Creala primero.`);

      await writeCells([{ rowNumber: row._row, colIndex0: i.etiqueta, value: name }]);
      setRows(prev => prev.map(x => x.id===row.id ? { ...x, etiqueta: name } : x));
      setAssignRowId(null); setAssignTo("");
      toast("Asignado a etiqueta ✓");
    } catch (e) {
      console.error(e);
      toast("No pude asignar etiqueta.");
    }
  };

  // quitar etiqueta en una fila
  const clearLabel = async (row) => {
    try {
      const i = row._colIndex;
      if (typeof i.etiqueta !== "number" || i.etiqueta < 0) return toast("Falta 'Etiqueta' en la hoja.");
      await writeCells([{ rowNumber: row._row, colIndex0: i.etiqueta, value: "" }]);
      setRows(prev => prev.map(x => x.id===row.id ? { ...x, etiqueta:"" } : x));
      toast("Etiqueta quitada ✓");
    } catch (e) { console.error(e); toast("No pude quitar etiqueta."); }
  };

  // dueñas presentes en el dataset activo
  const labelsBase = useMemo(() => {
    const names = new Set(base.filter(r => isTrue(r.etqMadre) && (r.etiqueta||"").trim()).map(r => r.etiqueta.trim()));
    return labelsAll.filter(l => names.has(l.name));
  }, [base, labelsAll]);

  // items por etiqueta (dataset activo)
  const itemsByLabel = useMemo(() => {
    const map = new Map();
    for (const r of base) {
      const name = (r.etiqueta || "").trim();
      if (!name) continue;
      const arr = map.get(name) || [];
      arr.push(r);
      map.set(name, arr);
    }
    return map;
  }, [base]);

  const selectedRow = useMemo(() => rows.find(x => x.id === selectedId) || null, [rows, selectedId]);

  // UI de estados iniciales
  if (!SHEET_ID) {
    return <div className="rounded-2xl border-2 border-[#fd006e] p-4 bg-white text-[#fd006e]">
      Falta configurar <code>VITE_PROG_SHEET_ID</code> o <code>VITE_SHEETS_SPREADSHEET_ID</code>.
    </div>;
  }
  if (!ready) {
    return <div className="rounded-2xl border-2 border-[#398FFF] p-6 bg-white">
      <div className="text-lg font-semibold text-[#398FFF]">Conectar Google</div>
      <p className="text-sm mt-1">Para leer/escribir en la hoja, conectá tu cuenta.</p>
      <button onClick={connect} className="mt-3 px-4 py-2 rounded-xl bg-[#398FFF] text-white hover:opacity-90">
        Conectar
      </button>
    </div>;
  }
  if (!tabName && !SHEET_TAB && import.meta.env.VITE_PROG_SHEET_GID) {
    return <div className="rounded-2xl border-2 border-[#398FFF] p-4 bg-white">
      Resolviendo pestaña a partir del <code>gid</code>… (conectado)
    </div>;
  }

  return (
    <div className="rounded-2xl border-2 border-[#398FFF] bg-white overflow-hidden relative">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-4 py-3 border-b-2 border-[#398FFF]">
        <div className="font-semibold">Casos en Progreso</div>
        <div className="flex flex-wrap items-center gap-2">
          {/* selector de dataset */}
          <div className="inline-flex rounded-xl border-2 overflow-hidden border-[#398FFF]">
            <button
              onClick={()=>setDataset("inv")}
              className={`px-3 py-1.5 text-sm ${dataset==="inv"?"bg-[#398FFF] text-white":"text-[#398FFF]"}`}
              title="Ver Invgates (NO evolutivos)"
            >Invgates</button>
            <button
              onClick={()=>setDataset("evo")}
              className={`px-3 py-1.5 text-sm ${dataset==="evo"?"bg-[#398FFF] text-white":"text-[#398FFF]"}`}
              title='Ver "Pedido de cambio"'
            >Evolutivos</button>
          </div>

          <button
            onClick={() => setShowHiddenCols(v => !v)}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 border-slate-400 text-slate-600 hover:bg-slate-50 text-xs md:text-sm"
          >
            {showHiddenCols ? "Ocultar columnas ocultas" : "Mostrar columnas ocultas"}
          </button>

          <button onClick={clearFilters} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border-2" style={{ borderColor:"#fd006e", color:"#fd006e" }}>
            <XCircle className="w-4 h-4" /> Limpiar filtros
          </button>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-[#398FFF] text-[#398FFF] hover:bg-[#398FFF] hover:text-white"
            title={collapsed ? "Expandir tabla" : "Contraer tabla"}>
            {collapsed ? "Expandir" : "Contraer"}
          </button>
          <button onClick={load} disabled={loading} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-[#398FFF] text-[#398FFF] hover:bg-[#398FFF] hover:text-white">
            <RefreshCcw className="w-4 h-4" /> {loading ? "Actualizando..." : "Actualizar"}
          </button>
        </div>
      </div>

      {/* Referencias */}
      <div className="px-4 py-3 border-b">
        <div className="text-sm font-medium mb-2">Referencias</div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-4 h-4 rounded-sm" style={{ background: MARKS.amarillo.bg, outline:`2px solid ${MARKS.amarillo.border}` }} />
            {MARKS.amarillo.label}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-4 h-4 rounded-sm" style={{ background: MARKS.celeste.bg, outline:`2px solid ${MARKS.celeste.border}` }} />
            {MARKS.celeste.label}
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="inline-block w-4 h-4 rounded-sm" style={{ background: "#fff", outline:`2px solid #7E57C2` }} />
            Borde coloreado = Etiqueta
          </span>
        </div>
        <div className="mt-3 text-sm">Seleccioná una fila para ver acciones rápidas.</div>
      </div>

      {/* Barra de acciones para la fila seleccionada */}
      {selectedRow && (() => {
        const rowSel = selectedRow;
        const labelStyle = getLabelStyle(rowSel.etiqueta);
        return (
          <div className="px-4 py-3 border-b bg-slate-50 flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap">
            <div className="text-sm">
              Fila seleccionada: <span className="font-medium">{rowSel.id}</span>
              {rowSel.etiqueta && (
                <span
                  className="ml-2 text-xs px-2 py-0.5 rounded-full"
                  style={{
                    background: labelStyle?.bg, color: labelStyle?.text, border:`1px solid ${labelStyle?.border}`
                  }}
                >{rowSel.etiqueta}</span>
              )}
            </div>

            {/* marca */}
            <button
              onClick={()=>markRow(rowSel, "amarillo")}
              className="px-3 py-1.5 rounded-lg border-2"
              style={{ borderColor: MARKS.amarillo.border, color: MARKS.amarillo.border }}
            >
              {MARKS.amarillo.label}
            </button>
            <button
              onClick={()=>markRow(rowSel, "celeste")}
              className="px-3 py-1.5 rounded-lg border-2"
              style={{ borderColor: MARKS.celeste.border, color: MARKS.celeste.border }}
            >
              {MARKS.celeste.label}
            </button>
            <button
              onClick={()=>markRow(rowSel, "")}
              className="px-3 py-1.5 rounded-lg border-2 border-neutral-400 text-neutral-600"
            >
              Quitar marca
            </button>

            {/* Escalamiento */}
            <button
              onClick={()=>toggleEscalamiento(rowSel)}
              className="px-3 py-1.5 rounded-lg border-2 border-amber-700 text-amber-700"
            >
              {String(rowSel.escalamiento || "").trim() === "Posible N3"
                ? "Quitar posible N3"
                : "Marcar posible N3"}
            </button>

            {/* Etiqueta madre */}
            {!isTrue(rowSel.etqMadre) ? (
              <button
                onClick={()=>{
                  const currentName = (rowSel.etiqueta || "").trim();
                  const currentKey = LABEL_PALETTE[normColor(rowSel.etqColor || "")] ? normColor(rowSel.etqColor) : "violeta";
                  setLabelModal({
                    open:true,
                    row: rowSel,
                    name: currentName,
                    colorKey: currentKey,
                  });
                }}
                className="px-3 py-1.5 rounded-lg border-2"
                style={{ borderColor: "#7E57C2", color: "#7E57C2" }}
              >
                Crear Etiqueta (madre)
              </button>
            ) : (
              <button
                onClick={()=>removeLabelOwner(rowSel)}
                className="px-3 py-1.5 rounded-lg border-2"
                style={{ borderColor: "#7E57C2", color: "#7E57C2" }}
              >
                Quitar Etiqueta (borra hijas)
              </button>
            )}

            {/* asignar a etiqueta */}
            {!isTrue(rowSel.etqMadre) && (
              <>
                {assignRowId === rowSel.id ? (
                  <>
                    <select
                      className="border rounded-lg px-2 py-1"
                      value={assignTo}
                      onChange={(e)=>setAssignTo(e.target.value)}
                    >
                      <option value="">Seleccionar etiqueta…</option>
                      {labelsAll.map(l => (
                        <option key={l.name} value={l.name}>{l.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={()=> assignToLabel(rowSel, assignTo)}
                      className="px-3 py-1.5 rounded-lg border-2"
                      style={{ borderColor: "#7E57C2", color: "#7E57C2" }}
                      disabled={!assignTo}
                    >
                      Asignar
                    </button>
                    <button
                      onClick={()=>{ setAssignRowId(null); setAssignTo(""); }}
                      className="px-3 py-1.5 rounded-lg border-2 border-neutral-400 text-neutral-600"
                    >
                      Cancelar
                    </button>
                  </>
                ) : (
                  <button
                    onClick={()=>{
                      if (labelsAll.length === 0) return toast("Primero creá al menos una etiqueta (madre).");
                      setAssignRowId(rowSel.id);
                      setAssignTo("");
                    }}
                    className="px-3 py-1.5 rounded-lg border-2"
                    style={{ borderColor: "#7E57C2", color: "#7E57C2" }}
                  >
                    Asignar a Etiqueta
                  </button>
                )}

                {String(rowSel.etiqueta || "").trim() && (
                  <button
                    onClick={()=>clearLabel(rowSel)}
                    className="px-3 py-1.5 rounded-lg border-2 border-neutral-400 text-neutral-600"
                  >
                    Quitar etiqueta
                  </button>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* Filtros en línea (select) */}
      <div className="px-4 py-3 border-b flex flex-wrap gap-4 items-end">
        <div className="flex flex-col min-w-[160px]">
          <label className="text-sm font-medium mb-1">Estado</label>
          <select
            className="border-2 rounded-lg px-2 py-1.5 text-sm"
            style={{ borderColor:"#398FFF" }}
            value={fEstado}
            onChange={(e)=>setFEstado(e.target.value)}
          >
            <option value="">Todos</option>
            {optsEstado.map(o => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col min-w-[160px]">
          <label className="text-sm font-medium mb-1">Prioridad</label>
          <select
            className="border-2 rounded-lg px-2 py-1.5 text-sm"
            style={{ borderColor:"#398FFF" }}
            value={fPrioridad}
            onChange={(e)=>setFPrioridad(e.target.value)}
          >
            <option value="">Todas</option>
            {optsPrioridad.map(o => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col min-w-[160px]">
          <label className="text-sm font-medium mb-1">Mesa</label>
          <select
            className="border-2 rounded-lg px-2 py-1.5 text-sm"
            style={{ borderColor:"#398FFF" }}
            value={fMesa}
            onChange={(e)=>setFMesa(e.target.value)}
          >
            <option value="">Todas</option>
            {optsMesa.map(o => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Tabla */}
      <div className={`overflow-auto ${collapsed ? "max-h-[60vh]" : ""}`}>
        <table className="min-w-full text-[13px] leading-tight">
          <thead style={{ background: "#E3F2FD" }}>
            <tr>
              <th className="px-3 py-1 text-xs font-semibold uppercase">Nro</th>
              <th className="px-3 py-1 text-xs font-semibold uppercase">Asunto</th>
              {showHiddenCols && (
                <th className="px-3 py-1 text-xs font-semibold uppercase">Usuario</th>
              )}
              {showHiddenCols && (
                <th className="px-3 py-1 text-xs font-semibold uppercase">Fecha de creación</th>
              )}
              <th className="px-3 py-1 text-xs font-semibold uppercase">Aging</th>
              <th className="px-3 py-1 text-xs font-semibold uppercase">Prioridad</th>
              <th className="px-3 py-1 text-xs font-semibold uppercase">Estado</th>
              <th className="px-3 py-1 text-xs font-semibold uppercase">Mesa</th>
              <th className="px-3 py-1 text-xs font-semibold uppercase">Agente asignado</th>
              {showHiddenCols && (
                <th className="px-3 py-1 text-xs font-semibold uppercase">Módulo</th>
              )}
              <th className="px-3 py-1 text-xs font-semibold uppercase">Escalamiento</th>
              <th className="px-3 py-1 text-xs font-semibold uppercase">Ticket N3</th>
              {showHiddenCols && (
                <th className="px-3 py-1 text-xs font-semibold uppercase">Comentario</th>
              )}
              <th className="px-3 py-1 text-xs font-semibold uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const isSelected = selectedId === r.id;
              const mark = r.marca || "";
              const labelStyle = getLabelStyle(r.etiqueta);

              return (
                <tr
                  key={r.id}
                  onClick={() => setSelectedId(isSelected ? null : r.id)}
                  className="border-b last:border-0"
                  style={{
                    background: mark ? (MARKS[mark]?.bg || "white") : "white",
                    outline: isSelected ? `2px solid ${MARKS[mark]?.border || labelStyle?.border || "#398FFF"}` : "none",
                    borderLeft: labelStyle ? `4px solid ${labelStyle.border}` : undefined,
                    cursor: "pointer",
                  }}
                  title="Clic para seleccionar fila"
                >
                  <td className="px-3 py-1 align-middle">{r.id}</td>
                  <td className="px-3 py-1 align-middle">
                    {r.asunto}
                    {r.etiqueta && (
                      <span
                        className="ml-2 text-[11px] px-2 py-0.5 rounded-full"
                        style={{ background: labelStyle?.bg, color: labelStyle?.text, border:`1px solid ${labelStyle?.border}` }}
                      >
                        {r.etiqueta}
                      </span>
                    )}
                  </td>

                  {showHiddenCols && (
                    <td className="px-3 py-1 align-middle">{r.usuario}</td>
                  )}
                  {showHiddenCols && (
                    <td className="px-3 py-1 align-middle">{r.fecha}</td>
                  )}

                  <td className="px-3 py-1 align-middle">{r.aging}</td>
                  <td className="px-3 py-1 align-middle">{r.prioridad}</td>
                  <td className="px-3 py-1 align-middle">{r.estado}</td>
                  <td className="px-3 py-1 align-middle">{r.mesa}</td>
                  <td className="px-3 py-1 align-middle">{r.agente}</td>

                  {showHiddenCols && (
                    <td className="px-3 py-1 align-middle">{r.modulo}</td>
                  )}

                  <td className="px-3 py-1 align-middle">
                    {String(r.escalamiento || "").trim() === "Posible N3"
                      ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-amber-50 text-amber-800 border border-amber-600">Posible N3</span>
                      : <span className="text-neutral-400">—</span>}
                  </td>

                  {/* Ticket N3 editable tocando la celda */}
                  <td
                    className="px-3 py-1 align-middle"
                    onClick={(e)=>{ e.stopPropagation(); startEdit(r); }}
                  >
                    {editId === r.id ? (
                      <input
                        className="w-40 rounded-md border px-2 py-1"
                        value={draft.ticketN3}
                        onChange={(e)=>setDraft(d => ({...d, ticketN3: e.target.value}))}
                        placeholder="Ticket N3…"
                      />
                    ) : (r.ticketN3 || <span className="text-neutral-400">—</span>)}
                  </td>

                  {/* Comentario editable sólo si se muestran columnas ocultas */}
                  {showHiddenCols && (
                    <td
                      className="px-3 py-1 align-middle"
                      onClick={(e)=>{ e.stopPropagation(); startEdit(r); }}
                    >
                      {editId === r.id ? (
                        <input
                          className="w-64 rounded-md border px-2 py-1"
                          value={draft.comentario}
                          onChange={(e)=>setDraft(d => ({...d, comentario: e.target.value}))}
                          placeholder="Comentario…"
                        />
                      ) : (r.comentario || <span className="text-neutral-400">—</span>)}
                    </td>
                  )}

                  <td className="px-3 py-1 align-middle whitespace-nowrap" onClick={(e)=>e.stopPropagation()}>
                    {editId === r.id && editId === r.id ? (
                      <div className="flex items-center gap-2 flex-nowrap overflow-x-auto whitespace-nowrap">
                        <button onClick={()=>saveEdit(r)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-white" style={{ background:"#398FFF" }}>
                          <Save className="w-4 h-4" /> Guardar
                        </button>
                        <button onClick={cancelEdit} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border-2" style={{ borderColor:"#fd006e", color:"#fd006e" }}>
                          <X className="w-4 h-4" /> Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 flex-nowrap overflow-x-auto whitespace-nowrap">
                        {/* Marca colores */}
                        <button
                          onClick={()=>markRow(r, "amarillo")}
                          className="px-3 py-1.5 rounded-lg border-2"
                          style={{ borderColor: MARKS.amarillo.border, color: MARKS.amarillo.border }}
                        >
                          {MARKS.amarillo.label}
                        </button>
                        <button
                          onClick={()=>markRow(r, "celeste")}
                          className="px-3 py-1.5 rounded-lg border-2"
                          style={{ borderColor: MARKS.celeste.border, color: MARKS.celeste.border }}
                        >
                          {MARKS.celeste.label}
                        </button>
                        <button
                          onClick={()=>markRow(r, "")}
                          className="px-3 py-1.5 rounded-lg border-2 border-neutral-400 text-neutral-600"
                        >
                          Quitar marca
                        </button>

                        {/* Escalamiento */}
                        <button
                          onClick={()=>toggleEscalamiento(r)}
                          className="px-3 py-1.5 rounded-lg border-2 border-amber-700 text-amber-700"
                        >
                          {String(r.escalamiento || "").trim() === "Posible N3"
                            ? "Quitar posible N3"
                            : "Posible N3"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}

            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={showHiddenCols ? 14 : 10}
                  className="px-4 py-6 text-center text-sm"
                >
                  Sin resultados (ajustá filtros).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Sección Etiquetas */}
      <div className="border-t px-4 py-3">
        <div className="text-sm font-semibold text-[#398FFF] mb-2">Etiquetas</div>

        {labelsBase.length === 0 && (
          <div className="text-sm text-slate-500">No hay etiquetas en esta vista.</div>
        )}

        {labelsBase.map(l => {
          const items = itemsByLabel.get(l.name) || [];
          const open = expandedLabels.has(l.name);
          const style = LABEL_PALETTE[l.colorKey || hashPaletteKey(l.name)];
          return (
            <div key={l.name} className="border rounded-xl mb-2">
              <button
                onClick={()=>{
                  const next = new Set(expandedLabels);
                  if (open) next.delete(l.name); else next.add(l.name);
                  setExpandedLabels(next);
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-left"
              >
                <div className="flex items-center gap-2">
                  {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  <span className="font-medium">{l.name}</span>
                  <span className="text-slate-500">— dueña {l.ownerId}</span>
                </div>
                <div className="text-xs text-slate-500">{items.length} caso(s)</div>
              </button>
              {open && (
                <div className="px-4 pb-3">
                  {items.length === 0 && <div className="text-sm text-slate-500">Sin asignados.</div>}
                  {items.length > 0 && (
                    <ul className="text-sm list-disc pl-5">
                      {items.map(c => (
                        <li key={c.id}>
                          <span className="font-medium" style={{ borderBottom:`2px solid ${style.border}` }}>{c.id}</span> — {c.asunto || "Sin asunto"}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal de creación de etiqueta madre */}
      {labelModal.open && labelModal.row && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40"
          onClick={() => setLabelModal({ open:false, row:null, name:"", colorKey:"violeta" })}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-sm w-full mx-4 p-5"
            onClick={(e)=>e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="font-semibold text-[#398FFF] text-sm">Crear etiqueta madre</div>
              <button
                onClick={() => setLabelModal({ open:false, row:null, name:"", colorKey:"violeta" })}
                className="p-1 rounded hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600 mb-3">
              Ticket: <span className="font-medium">{labelModal.row.id}</span> — {labelModal.row.asunto || "Sin asunto"}
            </div>

            <div className="mb-3">
              <label className="text-xs font-medium block mb-1">Nombre de la etiqueta</label>
              <input
                className="w-full border rounded-lg px-2 py-1.5 text-sm"
                value={labelModal.name}
                onChange={(e)=>setLabelModal(m => ({ ...m, name: e.target.value }))}
                placeholder="Ej: Ajustes facturación"
              />
            </div>

            <div className="mb-4">
              <label className="text-xs font-medium block mb-1">Color</label>
              <select
                className="w-full border rounded-lg px-2 py-1.5 text-sm"
                value={labelModal.colorKey}
                onChange={(e)=>setLabelModal(m => ({ ...m, colorKey: e.target.value }))}
              >
                {PALETTE_KEYS.map(key => (
                  <option key={key} value={key}>{key}</option>
                ))}
              </select>
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                <span
                  className="inline-block w-4 h-4 rounded-sm border"
                  style={{
                    background: LABEL_PALETTE[labelModal.colorKey]?.bg,
                    borderColor: LABEL_PALETTE[labelModal.colorKey]?.border,
                  }}
                />
                Vista previa
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setLabelModal({ open:false, row:null, name:"", colorKey:"violeta" })}
                className="px-3 py-1.5 rounded-lg border-2 border-neutral-400 text-neutral-600 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  const nm = (labelModal.name || "").trim();
                  if (!nm) return;
                  await createLabelOwner(labelModal.row, nm, labelModal.colorKey);
                  setLabelModal({ open:false, row:null, name:"", colorKey:"violeta" });
                }}
                disabled={!labelModal.name.trim()}
                className="px-3 py-1.5 rounded-lg border-2 text-sm"
                style={{ borderColor:"#7E57C2", color: "#7E57C2" }}
              >
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {msg && (
        <div className="m-3 rounded-2xl border-2 border-[#fd006e] text-[#fd006e] bg-white px-3 py-2 text-sm">
          {msg}
        </div>
      )}
    </div>
  );
}
