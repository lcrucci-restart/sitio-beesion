// src/pages/Documentacion.jsx
import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Search, ChevronRight } from "lucide-react";
import { PORTALES } from "../data/portales";

export default function Documentacion() {
  const [q, setQ] = useState("");

  const filteredPortales = useMemo(() => {
    if (!q) return PORTALES;
    const term = q.toLowerCase();
    return PORTALES.filter(
      (p) =>
        p.key.toLowerCase().includes(term) ||
        p.desc.toLowerCase().includes(term)
    );
  }, [q]);

  return (
    <main
      className="bg-white"
      style={{
        ["--brand-red"]: "#fd006e",
        ["--brand-blue"]: "#398FFF",
      }}
    >
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Documentación</h1>
              <p className="mt-2 text-slate-600">
                Accesos a los portales. Filtrá y entrá para subir o revisar documentos.
              </p>
            </div>
          </div>

          {/* Búsqueda */}
          <div className="mt-6 max-w-xl">
            <label htmlFor="q" className="sr-only">Buscar portal</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                id="q"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar: CXM, SOM, WFM, CPQ, SCRIPTS NIVEL 3, CASE…"
                className="w-full rounded-2xl border border-slate-300 bg-white px-11 py-3 outline-none focus:ring-4 focus:ring-[var(--brand-blue)]/20 focus:border-[var(--brand-blue)]"
              />
            </div>
          </div>

          {/* Grid de portales */}
          <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPortales.map((p, i) => {
              const isBlue = i % 2 === 0;
              const border = isBlue ? "border-[#398FFF]" : "border-[#fd006e]";
              const text  = isBlue ? "text-[#398FFF]"  : "text-[#fd006e]";
              const btn   = isBlue ? "bg-[#398FFF]"   : "bg-[#fd006e]";
              const slug  = p.key.toLowerCase().replace(/\s+/g, "-");

              return (
                <div key={p.key} className={`rounded-2xl border-2 ${border} bg-white`}>
                  <div className="p-6">
                    <div className={`text-[10px] font-semibold uppercase ${text}`}>Portal</div>
                    <h3 className={`mt-2 text-2xl font-bold ${text}`}>{p.key}</h3>
                    <p className={`mt-2 text-sm ${text}`}>{p.desc}</p>

                    <div className="mt-5">
                      <Link
                        to={`/portal/${encodeURIComponent(slug)}`}
                        className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl ${btn} text-white hover:opacity-90`}
                        title={`Ir a ${p.key}`}
                      >
                        Ingresar <ChevronRight className="w-4 h-4 text-white" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredPortales.length === 0 && (
              <div className="sm:col-span-2 lg:col-span-3 text-sm text-slate-500">
                Sin resultados para “{q}”.
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

