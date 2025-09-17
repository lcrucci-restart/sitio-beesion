// src/lib/drive.js
import { ensureToken, getAccessToken } from "./googleAuth";

const DRIVE_API  = "https://www.googleapis.com/drive/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3/files";

const FOLDER_MIME   = "application/vnd.google-apps.folder";
const SHORTCUT_MIME = "application/vnd.google-apps.shortcut";

/* =========================
   Helpers comunes
   ========================= */

// Flags para trabajar con Unidades compartidas
function allDrivesFlags(opts = {}) {
  // Siempre soportar “all drives”
  let qs = "supportsAllDrives=true&includeItemsFromAllDrives=true";
  // Si me pasás rootId (unidad compartida o carpeta raíz de esa unidad), enfoco el corpora
  if (opts.rootId) {
    // Para queries por nombre / listados dentro de esa unidad
    qs += `&corpora=drive&driveId=${encodeURIComponent(opts.rootId)}`;
  }
  return qs;
}

async function getMyDriveRootId() {
  const token = await ensureToken();
  const res = await fetch(`${DRIVE_API}/files/root?fields=id`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.id; // raíz de "Mi unidad"
}

/* =========================
   Carpeta por nombre
   ========================= */
async function ensureFolder(parentId, name, opts = {}) {
  const token = await ensureToken();

  // 1) Buscar carpeta hija por nombre dentro de parentId
  const q = `name='${name.replaceAll("'", "\\'")}' and '${parentId}' in parents and mimeType='${FOLDER_MIME}' and trashed=false`;
  const searchUrl = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id,name)&${allDrivesFlags(
    opts
  )}`;
  const res = await fetch(searchUrl, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (data.files?.length) return data.files[0].id;

  // 2) Crear si no existe
  const createUrl = `${DRIVE_API}/files?fields=id,name&${allDrivesFlags(opts)}`;
  const createRes = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name,
      mimeType: FOLDER_MIME,
      parents: [parentId],
    }),
  });
  const created = await createRes.json();
  return created.id;
}

/* =========================
   API expuesta
   ========================= */

/**
 * Crea (si hace falta) cada segmento de path y devuelve el ID de la última carpeta.
 * - Si pasás opts.rootId: empieza desde esa raíz (Unidad compartida / carpeta raíz).
 * - Si no: empieza desde la raíz de “Mi unidad”.
 */
export async function ensurePath(pathArr, opts = {}) {
  let parent = opts.rootId || (await getMyDriveRootId());
  for (const segment of pathArr) {
    parent = await ensureFolder(parent, segment, opts);
  }
  return parent;
}

/**
 * Lista archivos de una carpeta.
 */
export async function listFiles(folderId, opts = {}) {
  const token = await ensureToken();
  const fields =
    "nextPageToken,files(id,name,mimeType,iconLink,size,webViewLink,webContentLink,shortcutDetails)";
  const q = `'${folderId}' in parents and trashed=false`;
  const url = `${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(
    fields
  )}&pageSize=1000&orderBy=folder,name&${allDrivesFlags(opts)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  return data.files || [];
}

/**
 * Sube un archivo binario a una carpeta.
 */
export async function uploadFile(folderId, file, displayName, opts = {}) {
  const token = await ensureToken();

  const metadata = { name: displayName || file.name, parents: [folderId] };
  const form = new FormData();
  form.append("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
  form.append("file", file);

  const url = `${UPLOAD_API}?uploadType=multipart&fields=id,name,webViewLink,webContentLink,mimeType&${allDrivesFlags(
    opts
  )}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return res.json();
}

/**
 * Crea un atajo (shortcut) en la carpeta apuntando a un archivo de Drive existente.
 */
export async function createShortcut(folderId, targetFileId, displayName, opts = {}) {
  const token = await ensureToken();
  const body = {
    name: displayName || "Atajo",
    mimeType: SHORTCUT_MIME,
    shortcutDetails: { targetId: targetFileId },
    parents: [folderId],
  };
  const url = `${DRIVE_API}/files?fields=id,name,shortcutDetails&${allDrivesFlags(opts)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

/**
 * Elimina un archivo/atajo (a la papelera; en unidades compartidas requiere permisos).
 */
export async function deleteFile(fileId, opts = {}) {
  const token = await ensureToken();
  const url = `${DRIVE_API}/files/${fileId}?${allDrivesFlags(opts)}`;
  await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

/**
 * Abre (Docs/Sheets/Slides) o descarga (binarios) un archivo.
 */
export async function openOrDownload(file, opts = {}) {
  const token = getAccessToken();

  if (file.mimeType?.startsWith("application/vnd.google-apps")) {
    window.open(file.webViewLink, "_blank", "noopener,noreferrer");
    return;
  }

  const url = `${DRIVE_API}/files/${file.id}?alt=media&${allDrivesFlags(opts)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const blob = await res.blob();

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = file.name || "archivo";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/**
 * Extrae un fileId de URLs de Google (Docs/Sheets/Drive).
 */
export function extractDriveId(url) {
  try {
    const u = new URL(url);
    const re = /\/d\/([a-zA-Z0-9_-]+)/; // /d/<id>/
    const m = u.pathname.match(re);
    if (m?.[1]) return m[1];
    const id = u.searchParams.get("id");
    if (id) return id;
  } catch {}
  return null;
}

