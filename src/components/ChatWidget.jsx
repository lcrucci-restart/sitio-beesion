import React, { useEffect } from 'react';
import ChatCore from './ChatCore';
import { MessageCircle, X } from 'lucide-react';

export default function ChatWidget() {
  const [open, setOpen] = React.useState(false);

  // (opcional) recordar último estado por sesión
  useEffect(() => {
    const last = sessionStorage.getItem('chat_open');
    if (last === '1') setOpen(true);
  }, []);
  useEffect(() => {
    sessionStorage.setItem('chat_open', open ? '1' : '0');
  }, [open]);

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={()=>setOpen(true)}
        title="Asistente"
        className="fixed z-50 right-4 bottom-4 md:right-6 md:bottom-6 rounded-full shadow-lg border bg-white hover:bg-slate-50 p-3 md:p-4"
      >
        <MessageCircle className="w-6 h-6 md:w-7 md:h-7 text-[#398FFF]" />
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/30 md:bg-transparent"
          onClick={()=>setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Panel (slide-over en desktop, full en mobile) */}
      <div
        className={`fixed z-[60] bottom-0 right-0 w-full h-[70vh] md:h-[80vh] md:max-w-md 
                    bg-white border-t md:border-l md:rounded-tl-2xl shadow-xl
                    transform transition-transform duration-200
                    ${open ? 'translate-y-0 md:translate-x-0' : 'translate-y-full md:translate-x-full'}`}
        role="dialog" aria-label="Asistente"
        onClick={(e)=>e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-2">
          <div className="font-semibold text-[#398FFF]">Asistente</div>
          <button onClick={()=>setOpen(false)} className="p-1 rounded hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-4 h-[calc(100%-48px)]">
          <ChatCore />
        </div>
      </div>
    </>
  );
}
