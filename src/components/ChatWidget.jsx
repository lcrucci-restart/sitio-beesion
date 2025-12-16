import React, { useEffect, useRef, useState } from "react";
import ChatCore from "./ChatCore";
import { MessageCircle, X } from "lucide-react";

export default function ChatWidget() {
  const [open, setOpen] = React.useState(false);
  const [expanded, setExpanded] = useState(false); // modal centrado
  const [size, setSize] = useState({ height: 420 }); // altura del panel dockeado
  const [resizing, setResizing] = useState(false);

  const panelRef = useRef(null);
  const resizeStartRef = useRef({ y: 0, height: 420 });

  // recordar estado open por sesión
  useEffect(() => {
    const last = sessionStorage.getItem("chat_open");
    if (last === "1") setOpen(true);
  }, []);

  useEffect(() => {
    sessionStorage.setItem("chat_open", open ? "1" : "0");
  }, [open]);

  // altura inicial un poco más amable
  useEffect(() => {
    if (typeof window === "undefined") return;
    setSize((prev) => ({
      height: Math.min(window.innerHeight * 0.7, prev.height || 480),
    }));
  }, []);

  // handlers de resize (solo aplica cuando NO está expandido)
  const handleResizeStart = (e) => {
    if (expanded) return; // nada que hacer en modo modal

    e.preventDefault();
    e.stopPropagation();
    if (!panelRef.current) return;

    const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY);
    if (clientY == null) return;

    resizeStartRef.current = {
      y: clientY,
      height: panelRef.current.offsetHeight || size.height,
    };
    setResizing(true);
  };

  useEffect(() => {
    if (!resizing) return;

    const onMove = (e) => {
      const clientY = e.clientY ?? (e.touches && e.touches[0]?.clientY);
      if (clientY == null) return;

      const { y, height } = resizeStartRef.current;
      const dy = y - clientY; // arrastrar hacia arriba = más alto
      let newH = height + dy;
      newH = Math.max(260, Math.min(newH, 800)); // límites
      setSize({ height: newH });
    };

    const onUp = () => setResizing(false);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [resizing]);

  const handleOpen = () => {
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setExpanded(false);
  };

  const handleExpand = () => {
    setExpanded(true);
    setOpen(true);
  };

  const handleContract = () => {
    setExpanded(false);
  };

  // clases diferentes según modo dockeado vs expandido
  const containerClasses = expanded
    ? // modal centrado
      "fixed z-[60] inset-0 flex items-center justify-center pointer-events-none"
    : // dockeado abajo a la derecha
      "fixed z-[60] bottom-0 right-0 md:right-6 md:bottom-6 w-full md:w-[380px] pointer-events-none";

  const panelClasses = expanded
    ? "bg-white border border-slate-200 rounded-2xl shadow-2xl w-[95vw] max-w-4xl h-[85vh] flex flex-col pointer-events-auto"
    : "bg-white border-t md:border border-slate-200 md:rounded-tl-2xl shadow-xl flex flex-col pointer-events-auto";

  const panelStyle = expanded
    ? {}
    : { height: size.height };

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={handleOpen}
        title="Asistente"
        className="fixed z-50 right-4 bottom-4 md:right-6 md:bottom-6 rounded-full shadow-lg border bg-white hover:bg-slate-50 p-3 md:p-4"
      >
        <MessageCircle className="w-6 h-6 md:w-7 md:h-7 text-[#398FFF]" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/30"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}

      {/* Contenedor (único ChatCore adentro) */}
      {open && (
        <div className={containerClasses} aria-hidden={false}>
          <div
            ref={panelRef}
            className={panelClasses}
            style={panelStyle}
            role="dialog"
            aria-label="Asistente"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b px-4 py-2">
              <div className="font-semibold text-[#398FFF]">
                {expanded ? "Asistente — vista expandida" : "Asistente"}
              </div>
              <div className="flex items-center gap-2">
                {!expanded && (
                  <button
                    onClick={handleExpand}
                    className="hidden md:inline-flex text-xs px-2 py-1 rounded-lg border border-[#398FFF] text-[#398FFF] hover:bg-[#398FFF] hover:text-white"
                  >
                    Expandir
                  </button>
                )}
                {expanded && (
                  <button
                    onClick={handleContract}
                    className="text-xs px-2 py-1 rounded-lg border border-[#398FFF] text-[#398FFF] hover:bg-[#398FFF] hover:text-white"
                  >
                    Contraer
                  </button>
                )}
                <button
                  onClick={handleClose}
                  className="p-1 rounded hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Contenido */}
            <div className="flex-1 p-4 overflow-hidden">
              <ChatCore />
            </div>

            {/* Handle de resize (solo dockeado en desktop) */}
            {!expanded && (
              <div
                className="hidden md:flex items-center justify-start px-3 pb-2 text-[10px] text-slate-400 cursor-ns-resize select-none"
                onMouseDown={handleResizeStart}
                onTouchStart={handleResizeStart}
              >
                ⇕ Arrastrar para cambiar altura
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
