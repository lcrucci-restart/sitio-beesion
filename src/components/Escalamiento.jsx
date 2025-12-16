// src/components/Escalamiento.jsx
import React, { useEffect, useMemo, useState } from "react";
import { RefreshCcw } from "lucide-react";
import { hasGoogle, initTokenClient, ensureToken, isSignedIn } from "../lib/googleAuth";

const SHEET_ID =
  import.meta.env.VITE_PROG_SHEET_ID ||
  import.meta.env.VITE_SHEETS_SPREADSHEET_ID;

const SHEET_TAB = import.meta.env.VITE_PROG_SHEET_TAB || "Abiertos";
const API = "https://sheets.googleapis.com/v4/spreadsheets";

const HDR = {
  nro:         "Nro",
  asunto:      "Asunto",
  usuario:     "Usuario",
  prioridad:   "Prioridad",
  estado:      "Estado",
  mesa:        "Mesa",
  agente:      "Agente asignado",
  ticketN3:    "Ticket N3",
  comentario:  "Comentario",
  escalamiento:"Escalamiento",
};

export default function Escalamiento() {
  const [ready, setReady]     = useState(isSignedIn());
  const [loading, setLoading] = useState(false);
  const [rows, setRows]       = useState([]);
  const [msg, setMsg]         = useState(null);

  const toast = (t) => { setMsg(t); setTimeout(()=>setMsg(null), 2200); };

  const connect = async () => {
    try {
      if (!hasGoogle()) return alert("Falta Google Identity Services.");
      initTokenClient();
      await ensureToken();
      setReady(true);
    } catch (e) { console.error(e); alert("No se pudo conectar a Google."); }
  };

  const load = async () => {
    if (!SHEET_ID) return;
    const activeTab = SHEET_TAB;
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
        prioridad:   idx(HDR.prioridad),
        estado:      idx(HDR.estado),
        mesa:        idx(HDR.mesa),
        agente:      idx(HDR.agente),
        ticketN3:    idx(HDR.ticketN3),
        comentario:  idx(HDR.comentario),
        escalamiento:idx(HDR.escalamiento),
      };

      const out = values.slice(1)
        .filter(r => r && r.some(c => String(c).trim() !== ""))
        .map((r, k) => ({
          _row:        k + 2,
          id:          i.nro       >=0 ? (r[i.nro]       ?? "") : "",
          asunto:      i.asunto    >=0 ? (r[i.asunto]    ?? "") : "",
          usuario:     i.usuario   >=0 ? (r[i.usuario]   ?? "") : "",
          prioridad:   i.prioridad >=0 ? (r[i.prioridad] ?? "") : "",
          estado:      i.estado    >=0 ? (r[i.estado]    ?? "") : "",
          mesa:        i.mesa      >=0 ? (r[i.mesa]      ?? "") : "",
          agente:      i.agente    >=0 ? (r[i.agente]    ?? "") : "",
          ticketN3:    i.ticketN3  >=0 ? (r[i.ticketN3]  ?? "") : "",
          comentario:  i.comentario>=0 ? (r[i.comentario]?? "") : "",
          escalamiento:i.escalamiento>=0 ? (r[i.escalamiento] ?? "") : "",
        }));

      setRows(out);
    } catch (e) {
      console.error(e);
      toast("No pude leer la hoja de escalamiento.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (ready) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  const escalados = useMemo(
    () => rows.filter(r => String(r.escalamiento || "").trim() === "Posible N3"),
    [rows]
  );

  if (!SHEET_ID) {
    return <div className="rounded-2xl border-2 border-[#fd006e] p-4 bg-white text-[#fd006e]">
      Falta configurar <code>VITE_PROG_SHEET_ID</code> o <code>VITE_SHEETS_SPREADSHEET_ID</code>.
    </div>;
  }

  if (!ready) {
    return <div className="rounded-2xl border-2 border-[#398FFF] p-6 bg-white">
      <div className="text-lg font-semibold text-[#398FFF]">Para Escalar</div>
      <p className="text-sm mt-1">Conectá tu cuenta para ver posibles Nivel 3.</p>
      <button onClick={connect} className="mt-3 px-4 py-2 rounded-xl bg-[#398FFF] text-white hover:opacity-90">
        Conectar
      </button>
    </div>;
  }

  return (
    <div className="rounded-2xl border-2 border-[#398FFF] bg-white overflow-hidden mt-6">
      <div className="flex items-center justify-between px-4 py-3 border-b-2 border-[#398FFF]">
        <div className="font-semibold text-[#398FFF]">Para Escalar (Posibles Nivel 3)</div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-[#398FFF] text-[#398FFF] hover:bg-[#398FFF] hover:text-white"
        >
          <RefreshCcw className="w-4 h-4" />
          {loading ? "Actualizando..." : "Actualizar"}
        </button>
      </div>

      <div className="overflow-auto max-h-[50vh]">
        <table className="min-w-full text-[13px] leading-tight">
          <thead style={{ background:"#E3F2FD" }}>
            <tr>
              <th className="px-3 py-1 text-xs font-semibold uppercase">Nro</th>
              <th className="px-3 py-1 text-xs font-semibold uppercase">Asunto</th>
              <th className="px-3 py-1 text-xs font-semibold uppercase">Prioridad</th>
              <th className="px-3 py-1 text-xs font-semibold uppercase">Estado</th>
              <th className="px-3 py-1 text-xs font-semibold uppercase">Mesa</th>
              <th className="px-3 py-1 text-xs font-semibold uppercase">Agente</th>
              <th className="px-3 py-1 text-xs font-semibold uppercase">Ticket N3</th>
              <th className="px-3 py-1 text-xs font-semibold uppercase">Comentario</th>
            </tr>
          </thead>
          <tbody>
            {escalados.map(r => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-3 py-1 align-middle">{r.id}</td>
                <td className="px-3 py-1 align-middle">{r.asunto}</td>
                <td className="px-3 py-1 align-middle">{r.prioridad}</td>
                <td className="px-3 py-1 align-middle">{r.estado}</td>
                <td className="px-3 py-1 align-middle">{r.mesa}</td>
                <td className="px-3 py-1 align-middle">{r.agente}</td>
                <td className="px-3 py-1 align-middle">{r.ticketN3 || <span className="text-neutral-400">—</span>}</td>
                <td className="px-3 py-1 align-middle max-w-xs truncate" title={r.comentario}>
                  {r.comentario || <span className="text-neutral-400">—</span>}
                </td>
              </tr>
            ))}
            {escalados.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm">
                  No hay casos marcados como "Posible N3".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {msg && (
        <div className="m-3 rounded-2xl border-2 border-[#fd006e] text-[#fd006e] bg-white px-3 py-2 text-sm">
          {msg}
        </div>
      )}
    </div>
  );
}
