// src/components/GeminiInsights.jsx
import React, { useEffect, useMemo, useState } from "react";
import { Sparkles, RefreshCcw } from "lucide-react";
import { readGeminiInsights } from "../lib/sheets";

const HDR_GEMINI = {
  tema: "Tema",
  insight: "Insight",
  actualizado: "Última actualización",
};

export default function GeminiInsights() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const { rows: r, headers } = await readGeminiInsights();

      // chequeo mínimo de headers
      const need = [HDR_GEMINI.tema, HDR_GEMINI.insight];
      const missing = need.filter((h) => !headers.includes(h));
      if (missing.length) {
        throw new Error(
          `Faltan columnas en pestaña Gemini: ${missing.join(", ")}`
        );
      }

      setRows(Array.isArray(r) ? r : []);
    } catch (e) {
      console.error("GeminiInsights load error:", e);
      setErr(e.message || "No pude leer la pestaña Gemini.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const normalized = useMemo(
    () =>
      rows.map((r, idx) => ({
        id: idx,
        tema: r[HDR_GEMINI.tema] || "Sin tema",
        insight: r[HDR_GEMINI.insight] || "",
        actualizado: r[HDR_GEMINI.actualizado] || "",
      })),
    [rows]
  );

  return (
    <div className="mt-8 rounded-2xl border-2 border-[#398FFF] bg-white p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[#fd006e]" />
          <div>
            <div className="text-sm font-semibold text-[#398FFF]">
              Insights (Gemini)
            </div>
            <div className="text-xs text-slate-500">
              Resumen generado en la pestaña <code>Gemini</code> del reporte.
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 border-[#398FFF] text-[#398FFF] text-xs hover:bg-[#398FFF] hover:text-white disabled:opacity-60"
        >
          <RefreshCcw className="w-3 h-3" />
          {loading ? "Actualizando…" : "Actualizar"}
        </button>
      </div>

      {err && (
        <div className="mb-3 rounded-xl border-2 border-[#fd006e] bg-white px-3 py-2 text-xs text-[#fd006e]">
          {err}
        </div>
      )}

      {!loading && !err && normalized.length === 0 && (
        <div className="text-sm text-slate-500">
          No hay filas en la pestaña <code>Gemini</code>.  
          Cargá al menos <b>{HDR_GEMINI.tema}</b> e <b>{HDR_GEMINI.insight}</b>.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {normalized.map((item) => (
          <article
            key={item.id}
            className="border rounded-xl p-4 bg-slate-50 flex flex-col gap-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium text-[#398FFF] bg-white">
                {item.tema}
              </span>
              {item.actualizado && (
                <span className="text-[11px] text-slate-500">
                  Actualizado: {item.actualizado}
                </span>
              )}
            </div>

            <p className="text-sm text-slate-700 whitespace-pre-wrap">
              {item.insight || "Sin texto de insight."}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}
