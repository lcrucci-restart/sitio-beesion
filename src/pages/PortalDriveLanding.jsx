import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link, Routes, Route, Navigate } from "react-router-dom";
import { ensurePath, listFiles, uploadFile, createShortcut, deleteFile, openOrDownload, extractDriveId } from "../lib/drive";
import { Upload, Link as LinkIcon, Download, Trash2, RefreshCcw, ChevronRight } from "lucide-react";
import { hasGoogle, initTokenClient, ensureToken, isSignedIn } from "../lib/googleAuth";

const CATEGORIES = [
  { key: "analisis", label: "Análisis a Nivel 3" },
  { key: "paso-a-paso", label: "Paso a Paso" },
  { key: "tutoriales", label: "Tutoriales / Guías" },
];
const CAT_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.label]));

const toTitle = (slug = "") =>
  slug
    .split("-")
    .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : s))
    .join(" ");

function CategoryPanel({ baseName, portalTitle, catKey }) {
  const subLabel = CAT_MAP[catKey];
  const folderPath = [baseName, portalTitle, subLabel];

  const [folderId, setFolderId] = useState(null);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState(null);

  const load = async () => {
    setBusy(true);
    try {
      const id = await ensurePath(folderPath);
      setFolderId(id);
      const files = await listFiles(id);
      setItems(files);
    } catch (e) {
      console.error(e);
      alert("No se pudieron listar archivos. Revisá permisos.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseName, portalTitle, catKey]);

  const onAddUrl = async (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    const id = extractDriveId(url.trim());
    if (!id) return alert("No pude extraer el ID de ese enlace de Google.");
    try {
      setBusy(true);
      await createShortcut(folderId, id, name || "Atajo");
      await load();
      setName("");
      setUrl("");
    } finally {
      setBusy(false);
    }
  };

  const onAddFile = async (e) => {
    e.preventDefault();
    if (!file) return;
    try {
      setBusy(true);
      await uploadFile(folderId, file, name || file.name);
      await load();
      setName("");
      setFile(null);
      e.target?.reset?.();
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id) => {
    if (!confirm("¿Eliminar este elemento definitivamente de Drive?")) return;
    try {
      setBusy(true);
      await deleteFile(id);
      await load();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-10 space-y-6">
      {/* Cabecera de ruta (raíz en negrita y más grande) */}
      <div className="flex items-center justify-between">
        <div className="text-base">
          <span className="font-bold text-black">
            Carpeta: {baseName} / {portalTitle}
          </span>
          <span className="text-[#398FFF]"> / {subLabel}</span>
        </div>
        <button
          onClick={load}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-[#398FFF] text-[#398FFF] hover:bg-[#398FFF] hover:text-white"
        >
          <RefreshCcw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {/* Alta de URL */}
      <form
        onSubmit={onAddUrl}
        className="rounded-2xl border-2 border-[#398FFF] p-4 bg-white"
      >
        <div className="text-sm mb-3 font-semibold flex items-center gap-2 text-[#398FFF]">
          <LinkIcon className="w-4 h-4" /> Agregar enlace de Google (Docs/Sheets/Slides/Drive)
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            placeholder="Nombre (opcional)"
            className="rounded-xl border-2 border-[#398FFF] px-3 py-2 outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            placeholder="URL de Google (https://docs.google.com/...)"
            className="rounded-xl border-2 border-[#398FFF] px-3 py-2 outline-none"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
        <div className="mt-3">
          <button
            disabled={busy}
            className="px-4 py-2 rounded-xl bg-[#398FFF] text-white hover:opacity-90"
          >
            Guardar enlace
          </button>
        </div>
      </form>

      {/* Alta de archivo */}
      <form
        onSubmit={onAddFile}
        className="rounded-2xl border-2 border-[#fd006e] p-4 bg-white"
      >
        <div className="text-sm mb-3 font-semibold flex items-center gap-2 text-[#fd006e]">
          <Upload className="w-4 h-4" /> Subir archivo a Drive
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <input
            placeholder="Nombre para mostrar (opcional)"
            className="rounded-xl border-2 border-[#fd006e] px-3 py-2 outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="rounded-xl border-2 border-[#fd006e] px-3 py-2 file:mr-2 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-white"
          />
        </div>
        <div className="mt-3">
          <button
            disabled={busy}
            className="px-4 py-2 rounded-xl bg-[#fd006e] text-white hover:opacity-90"
          >
            Subir archivo
          </button>
        </div>
      </form>

      {/* Lista de elementos */}
      <div className="rounded-2xl border-2 border-[#398FFF] bg-white overflow-hidden">
        <div className="px-4 py-3 border-b-2 border-[#398FFF] text-sm font-semibold text-[#398FFF]">
          Elementos
        </div>
        {items.length === 0 ? (
          <div className="px-4 py-6 text-sm">Aún no hay elementos.</div>
        ) : (
          <ul>
            {items.map((f) => (
              <li
                key={f.id}
                className="px-4 py-3 flex items-center justify-between gap-4 border-b last:border-0"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{f.name}</div>
                  <div className="text-xs">{f.mimeType}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openOrDownload(f)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 border-[#398FFF] text-[#398FFF] hover:bg-[#398FFF] hover:text-white"
                  >
                    <Download className="w-4 h-4" /> Abrir/Descargar
                  </button>
                  <button
                    onClick={() => onDelete(f.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border-2 border-[#fd006e] text-[#fd006e] hover:bg-[#fd006e] hover:text-white"
                  >
                    <Trash2 className="w-4 h-4" /> Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CategoryRoute({ baseName, portalTitle }) {
  const { cat } = useParams();
  if (!CAT_MAP[cat]) {
    return (
      <div className="mt-8 rounded-2xl border-2 border-[#fd006e] p-4 text-[#fd006e] bg-white">
        Subcarpeta inválida.
      </div>
    );
  }
  return (
    <CategoryPanel baseName={baseName} portalTitle={portalTitle} catKey={cat} />
  );
}

export default function PortalDriveLanding() {
  const { slug } = useParams();
  const portalTitle = toTitle(slug).replaceAll("-", " ");
  const isScriptsN3 = slug === "scripts-nivel-3";
  const BASE = import.meta.env.VITE_DRIVE_BASE_FOLDER_NAME || "Soporte Documentación";

  // Guard simple: si no está conectado, pedir conexión
  const [ready, setReady] = useState(isSignedIn());
  const handleConnect = async () => {
    try {
      if (!hasGoogle()) return alert("Falta el script de Google Identity Services.");
      initTokenClient();
      await ensureToken();
      setReady(true);
    } catch (e) {
      console.error(e);
      alert("No se pudo conectar a Google Drive.");
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      <div className="text-sm">
        <Link to="/" className="hover:underline">
          ← Volver a inicio
        </Link>
      </div>

      <h1 className="mt-2 text-2xl sm:text-3xl font-bold">{portalTitle}</h1>
      <p className="mt-2">
        Gestioná archivos y enlaces en las subcarpetas de este portal.
      </p>

      {!ready && (
        <div className="mt-6 rounded-2xl border-2 border-[#398FFF] p-6 bg-white">
          <div className="text-lg font-semibold text-[#398FFF]">
            Conectar Google Drive
          </div>
          <p className="text-sm mt-2">
            Para ver y gestionar archivos de este portal, conectá tu cuenta.
          </p>
          <button
            onClick={handleConnect}
            className="mt-4 px-4 py-2 rounded-xl bg-[#398FFF] text-white hover:opacity-90"
          >
            Conectar Drive
          </button>
        </div>
      )}

      {ready && (
        <>
          {/* Ruta raíz (más grande y en negrita) */}
          <div className="mt-6 text-lg">
            <span className="font-bold">
              Carpeta: {BASE} / {portalTitle}
            </span>
          </div>

          {/* Aviso en rojo para subir solo con subcarpeta */}
          <div className="mt-3 rounded-xl border-2 border-[#fd006e] text-[#fd006e] bg-white p-3 text-sm">
            Elegí una subcarpeta para habilitar la subida de archivos o enlaces.
          </div>

          {/* Tarjetas de categorías */}
          {!isScriptsN3 ? (
            <div className="mt-6 grid sm:grid-cols-3 gap-4">
              {CATEGORIES.map((cat) => (
                <Link
                  key={cat.key}
                  to={`/portal/${slug}/${cat.key}`}
                  className="rounded-2xl border-2 border-[#398FFF] p-4 bg-white hover:bg-[#398FFF] hover:text-white transition flex items-center justify-between"
                >
                  <div className="font-semibold">{cat.label}</div>
                  <ChevronRight className="w-4 h-4" />
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border-2 border-[#398FFF] p-8 bg-white">
              <div className="font-semibold">SCRIPTS NIVEL 3</div>
              <div className="text-sm mt-1">Por ahora dejamos esta landing vacía.</div>
            </div>
          )}

          {/* Contenido SOLO cuando hay subcarpeta seleccionada */}
          {!isScriptsN3 && (
            <Routes>
              <Route
                path=":cat"
                element={<CategoryRoute baseName={BASE} portalTitle={portalTitle} />}
              />
            </Routes>
          )}
        </>
      )}
    </div>
  );
}