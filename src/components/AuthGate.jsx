// src/components/AuthGate.jsx
import React, { useEffect, useRef, useState } from 'react';

// --- dominios permitidos ---
// Podés setearlos por .env: VITE_ALLOWED_DOMAINS="iplan.com.ar,restart-ai.com"
// Si no existe, usa el fallback del array.
const DOMAINS_FROM_ENV = (import.meta.env.VITE_ALLOWED_DOMAINS || '')
  .split(',')
  .map(s => s.trim().toLowerCase())
  .filter(Boolean);

export const ALLOWED_DOMAINS = DOMAINS_FROM_ENV.length
  ? DOMAINS_FROM_ENV
  : ['iplan.com.ar', 'restart-ai.com'];

export function emailToDomain(email) {
  return (email.split('@').pop() || '').toLowerCase();
}

export function isDomainAllowed(email, hd) {
  const d = emailToDomain(email);
  // Acepta dominio exacto y subdominios; también respeta claim hd (Google Workspace)
  return ALLOWED_DOMAINS.some(ad =>
    d === ad || d.endsWith('.' + ad) ||
    (hd && (hd.toLowerCase() === ad || hd.toLowerCase().endsWith('.' + ad)))
  );
}

// --- JWT / Google ---
export function decodeJwt(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(
      atob(b64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export function isAllowedFromGoogleIdToken(idToken) {
  const p = decodeJwt(idToken);
  const email = p && p.email;
  const verified = !!(p && p.email_verified);
  const hd = (p && p.hd ? p.hd : '').toLowerCase();

  if (!email || !verified) return false;
  return isDomainAllowed(email, hd);
}

export default function AuthGate({ children }) {
  const [authed, setAuthed] = useState(false);
  const [email, setEmail] = useState(null);
  const btnRef = useRef(null);

  useEffect(() => {
    function onCredential(resp) {
      try {
        // 🔴 CLAVE: guardar el ID token para el chat
        window.__lastGoogleIdToken = resp.credential;

        const ok = isAllowedFromGoogleIdToken(resp.credential);
        if (!ok) { setAuthed(false); setEmail(null); return; }

        const payload = decodeJwt(resp.credential);
        setEmail(payload?.email || null);
        setAuthed(true);
      } catch {
        setAuthed(false);
        setEmail(null);
        window.__lastGoogleIdToken = undefined;
      }
    }

    function init() {
      if (!window.google?.accounts?.id) return;
      window.google.accounts.id.initialize({
        client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID,
        callback: onCredential,
        auto_select: false,
        itp_support: true,
      });
      if (btnRef.current) {
        window.google.accounts.id.renderButton(btnRef.current, { theme: 'outline', size: 'large' });
      }
      // opcional: One Tap
      // window.google.accounts.id.prompt();
    }

    if (window.google?.accounts?.id) { init(); }
    else {
      const t = setInterval(() => {
        if (window.google?.accounts?.id) { clearInterval(t); init(); }
      }, 300);
      return () => clearInterval(t);
    }
  }, []);

  if (!authed) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <h1>Acceso</h1>
          <p>Iniciá sesión con tu cuenta corporativa autorizada.</p>
        <div ref={btnRef} />
        </div>
      </div>
    );
  }

  return children;
}
