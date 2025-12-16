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

  // altura inicial algo más cómoda
  useEffect(() => {
    if (typeof window === "undefined") return;
    setSize((prev) => ({
      height: Math.min(window.innerHeight * 0.7, prev.height || 480),
    }));
  }, []);

  // handlers de resize (solo desktop, panel dockeado)
  const handleResizeStart = (e) => {
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

      {/* Panel dockeado (abajo derecha) */}
      {open && !expanded && (
        <div
          ref={panelRef}
          className="fixed z-[60] bottom-0 right-0 md:right-6 md:bottom-6 w-full md:w-[380px] bg-white border-t md:border border-slate-200 md:rounded-tl-2xl shadow-xl flex flex-col"
          style={{ height: size.height }}
          role="dialog"
          aria-label="Asistente"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b px-4 py-2">
            <div className="font-semibold text-[#398FFF]">Asistente</div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleExpand}
                className="hidden md:inline-flex text-xs px-2 py-1 rounded-lg border border-[#398FFF] text-[#398FFF] hover:bg-[#398FFF] hover:text-white"
              >
                Expandir
              </button>
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

          {/* Handle de resize (solo desktop) */}
          <div
            className="hidden md:flex items-center justify-start px-3 pb-2 text-[10px] text-slate-400 cursor-ns-resize select-none"
            onMouseDown={handleResizeStart}
            onTouchStart={handleResizeStart}
          >
            ⇕ Arrastrar para cambiar altura
          </div>
        </div>
      )}

      {/* Modal expandido (centrado) */}
      {open && expanded && (
        <div
          className="fixed z-[70] inset-0 flex items-center justify-center pointer-events-none"
          aria-hidden={false}
        >
          <div
            className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-[95vw] max-w-4xl h-[85vh] flex flex-col pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Asistente expandido"
          >
            <div className="flex items-center justify-between border-b px-4 py-2">
              <div className="font-semibold text-[#398FFF]">
                Asistente — vista expandida
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleContract}
                  className="text-xs px-2 py-1 rounded-lg border border-[#398FFF] text-[#398FFF] hover:bg-[#398FFF] hover:text-white"
                >
                  Contraer
                </button>
                <button
                  onClick={handleClose}
                  className="p-1 rounded hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 p-4 overflow-hidden">
              <ChatCore />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
