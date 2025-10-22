import React, { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";

import { hasGoogle, initTokenClient, restoreFromStorage } from "./lib/googleAuth";

// Layout
import Navbar from "./components/Navbar";
import ScrollToTop from "./components/ScrollToTop";

// Pages
import Home from "./pages/Home";                 // Dashboard solo
import Progreso from "./pages/Progreso";         // Casos en Progreso
import N3 from "./pages/N3";                     // Casos N3
import Documentacion from "./pages/Documentacion"; // Listado de portales / acceso a doc
import PortalDriveLanding from "./pages/PortalDriveLanding"; // /portal/:slug
import ChatWidget from "./components/ChatWidget.jsx";
import Reportes from "./pages/Reportes";

export default function App() {
  useEffect(() => {
    if (!hasGoogle()) return;
    initTokenClient();
    restoreFromStorage();
  }, []);

  return (
    <div
      className="min-h-screen bg-white text-slate-900"
      style={{
        ["--brand-red"]: "#fd006e",
        ["--brand-blue"]: "#398FFF",
      }}
    >
      <Navbar />
      <ScrollToTop />

      <Routes>
        <Route path="/" element={<Home />} />
        // <Route path="/documentacion" element={<Documentacion />} />
        <Route path="/reportes" element={<Reportes />} />
        <Route path="/progreso" element={<Progreso />} />
        <Route path="/n3" element={<N3 />} />
        <Route path="/portal/:slug/*" element={<PortalDriveLanding />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      
      <ChatWidget />

      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8 text-sm text-slate-500 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>© {new Date().getFullYear()} Soporte • Documentación</div>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="hover:text-slate-700"
            title="Volver arriba"
          >
            Volver al inicio
          </button>
        </div>
      </footer>
    </div>
  );
}


