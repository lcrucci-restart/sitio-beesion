import React, { useEffect, useState } from "react";
import { ensureToken, getUserInfo, requestWriteScopes, revokeToken, hasGoogle } from "../lib/googleAuth";

const REQUIRED_DOMAIN = "tu-dominio.com"; // <-- cámbialo por el tuyo (p.ej. beesion.com)

export default function AuthGate({ children }) {
  const [state, setState] = useState({ status: "boot" }); // boot|loading|denied|ready
  const [msg, setMsg] = useState("");

  useEffect(() => {
    // Espera a que cargue el script de GIS
    if (!hasGoogle()) {
      const t = setTimeout(() => setState({ status: "loading" }), 50);
      return () => clearTimeout(t);
    }
    (async () => {
      try {
        setState({ status: "loading" });
        // intenta silent (si ya hay consentimiento)
        await ensureToken();
        const u = await getUserInfo(); // { email, hd, ... } (ya lo tenés implementado)
        const email = u?.email || "";
        const domain = u?.hd || (email.includes("@") ? email.split("@")[1] : "");
        if (domain !== REQUIRED_DOMAIN) {
          setMsg(`Esta cuenta (${email || "desconocida"}) no pertenece a ${REQUIRED_DOMAIN}.`);
          await revokeToken(); // limpia token si no corresponde
          setState({ status: "denied" });
          return;
        }
        setState({ status: "ready" });
      } catch (e) {
        // No había token aún / no hay consentimiento → pedir login
        setState({ status: "denied" });
      }
    })();
  }, []);

  const signIn = async () => {
    try {
      setState({ status: "loading" });
      await requestWriteScopes();      // prompt=consent con tus SCOPES
      const u = await getUserInfo();
      const email = u?.email || "";
      const domain = u?.hd || (email.includes("@") ? email.split("@")[1] : "");
      if (domain !== REQUIRED_DOMAIN) {
        setMsg(`Esta cuenta (${email || "desconocida"}) no pertenece a ${REQUIRED_DOMAIN}.`);
        await revokeToken();
        setState({ status: "denied" });
        return;
      }
      setState({ status: "ready" });
    } catch (e) {
      setMsg("No se pudo iniciar sesión.");
      setState({ status: "denied" });
    }
  };

  if (state.status === "boot" || state.status === "loading") {
    return <div className="p-8 text-center">Cargando…</div>;
  }

  if (state.status === "denied") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="max-w-md p-6 border rounded-xl shadow-sm text-center">
          <h1 className="text-lg font-semibold mb-2">Acceso restringido</h1>
          <p className="text-sm text-slate-600 mb-4">
            Solo usuarios de <strong>@{REQUIRED_DOMAIN}</strong>.
          </p>
          {!!msg && <p className="text-xs text-slate-500 mb-3">{msg}</p>}
          <button
            className="px-4 py-2 rounded-lg border hover:bg-slate-50"
            onClick={signIn}
          >
            Iniciar sesión con Google
          </button>
        </div>
      </div>
    );
  }

  // ready
  return <>{children}</>;
}
