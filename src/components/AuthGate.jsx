import React, { useEffect, useState } from "react";
import { ensureToken, getUserInfo, requestWriteScopes, revokeToken, hasGoogle } from "../lib/googleAuth";

// Dominios permitidos (agregá/quitá los que quieras)
export const ALLOWED_DOMAINS = [
  "iplan.com.ar",
  "restart-ai.com",
];

// extrae el dominio del email
export function emailToDomain(email) {
  return (email.split("@").pop() || "").toLowerCase();
}

// true si el dominio del email es igual o subdominio de alguno permitido
export function isDomainAllowed(email) {
  const d = emailToDomain(email);
  return ALLOWED_DOMAINS.some(ad => d === ad || d.endsWith("." + ad));
}

// ---- Si usás login de Google (ID token) ----

// tiny JWT decoder (sin libs)
export function decodeJwt(token) {
  const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  const json = decodeURIComponent(
    atob(b64).split("").map(c => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)).join("")
  );
  return JSON.parse(json);
}

// Acepta si el email verificado pertenece a dom permitido,
// o si el claim `hd` coincide con alguno permitido
export function isAllowedFromGoogleIdToken(idToken) {
  const p = decodeJwt(idToken);
  const email = p && p.email;
  const verified = !!(p && p.email_verified);
  const hd = (p && p.hd ? p.hd : "").toLowerCase();

  if (!email || !verified) return false;
  if (isDomainAllowed(email)) return true;

  // fallback por `hd` (Google Workspace)
  return ALLOWED_DOMAINS.some(ad => hd === ad || (hd && hd.endsWith("." + ad)));
}


export default function AuthGate({ children }) {
  const [authed, setAuthed] = useState(false);
  const [email, setEmail] = useState(null);
  const btnRef = useRef(null);

  useEffect(() => {
    function onCredential(resp) {
      try {
        const ok = isAllowedFromGoogleIdToken(resp.credential);
        if (!ok) {
          setAuthed(false);
          setEmail(null);
          return;
        }
        const payload = decodeJwt(resp.credential);
        setEmail(payload.email || null);
        setAuthed(true);
      } catch (e) {
        setAuthed(false);
        setEmail(null);
      }
    }

    function init() {
      if (!window.google || !window.google.accounts || !window.google.accounts.id) return;
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: onCredential,
        auto_select: false,
        itp_support: true,
      });
      if (btnRef.current) {
        window.google.accounts.id.renderButton(btnRef.current, { theme: "outline", size: "large" });
      }
      // opcional: One Tap
      // window.google.accounts.id.prompt();
    }

    // si el script ya cargó
    if (window.google && window.google.accounts && window.google.accounts.id) {
      init();
    } else {
      // reintenta hasta que cargue el script
      const t = setInterval(() => {
        if (window.google && window.google.accounts && window.google.accounts.id) {
          clearInterval(t);
          init();
        }
      }, 300);
      return () => clearInterval(t);
    }
  }, []);

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        <div style={{ textAlign: "center" }}>
          <h1>Acceso</h1>
          <p>Iniciá sesión con tu cuenta corporativa autorizada.</p>
          <div ref={btnRef} />
        </div>
      </div>
    );
  }

  return children;
}
