// src/lib/googleAuth.js

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

// Mantené SCOPES como **array**
export const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",          // escritura Sheets
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "openid",
  "email",
  "profile",
];

let accessToken = null;
let tokenExpiry = 0; // ms (Date.now())
let tokenClient = null;

const STORAGE_KEY = "gdrive_oauth_token_v1";

// para no intentar restaurar mil veces
let restoredOnce = false;

function persistToken() {
  try {
    if (accessToken && tokenExpiry) {
      sessionStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ accessToken, tokenExpiry })
      );
    }
  } catch {
    // ignoramos errores de storage
  }
}

export function restoreFromStorage() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const { accessToken: t, tokenExpiry: e } = JSON.parse(raw);
    if (t && e && Date.now() < e) {
      accessToken = t;
      tokenExpiry = e;
      return true;
    }
  } catch {
    // si algo falla, devolvemos false y seguimos sin token
  }
  return false;
}

export function hasGoogle() {
  return !!(window?.google?.accounts?.oauth2);
}

export function isSignedIn() {
  // bootstrapAuthFromStorage() ya intentó rehidratar al importar el módulo
  return !!accessToken && Date.now() < tokenExpiry;
}

export function getAccessToken() {
  return isSignedIn() ? accessToken : null;
}

export function initTokenClient() {
  if (!hasGoogle()) throw new Error("Google Identity Services no está disponible.");
  if (tokenClient) return tokenClient;

  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: CLIENT_ID,
    scope: SCOPES.join(" "), // todos los scopes en un string
    // callback se setea dinámicamente
    callback: () => {},
  });
  return tokenClient;
}

// flujo normal (silencioso si ya diste consent)
export async function ensureToken() {
  if (isSignedIn()) return accessToken;

  initTokenClient();

  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp?.access_token) {
        accessToken = resp.access_token;
        const ttl = (resp.expires_in ?? 3600) - 60; // colchón 60s
        tokenExpiry = Date.now() + ttl * 1000;
        persistToken();
        resolve(accessToken);
      } else {
        reject(new Error("No se obtuvo access_token"));
      }
    };
    // intenta sin prompt (silencioso si ya autorizaste antes)
    tokenClient.requestAccessToken({ prompt: "" });
  });
}

// para “subir” scopes (mostrar consentimiento explícito)
export function requestWriteScopes() {
  initTokenClient();
  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp?.access_token) {
        accessToken = resp.access_token;
        const ttl = (resp.expires_in ?? 3600) - 60;
        tokenExpiry = Date.now() + ttl * 1000;
        persistToken(); // guardamos en la misma key
        resolve(accessToken);
      } else {
        reject(new Error("No se obtuvo access_token"));
      }
    };
    // Pedimos consent con TODOS los scopes
    tokenClient.requestAccessToken({ prompt: "consent", scope: SCOPES.join(" ") });
  });
}

export function revokeToken() {
  try {
    if (accessToken && window?.google?.accounts?.oauth2?.revoke) {
      window.google.accounts.oauth2.revoke(accessToken, () => {});
    }
  } catch {
    // ignoramos error de revoke
  }
  accessToken = null;
  tokenExpiry = 0;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignoramos error de storage
  }
}

// consultar info básica del usuario (email, nombre, etc.)
export async function getUserInfo() {
  const t = getAccessToken();
  if (!t) return null;
  const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (!r.ok) return null;
  return r.json(); // { email, name, ... }
}

// ========= bootstrap automático =========

// Rehidratar token automáticamente cuando se importa el módulo
(function bootstrapAuthFromStorage() {
  try {
    if (!restoredOnce) {
      restoredOnce = true;
      restoreFromStorage();
    }
  } catch {
    // si algo explota, seguimos sin token y listo
  }
})();
