import React, { useState, useEffect, useRef } from 'react';

export default function ChatCore() {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    // auto-scroll al último mensaje
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [msgs]);

  async function send(e) {
    e?.preventDefault();
    const q = text.trim();
    if (!q) return;
    const url     = import.meta.env.VITE_GAS_URL;
    const appKey  = import.meta.env.VITE_GAS_APP_KEY || '';
    const idToken = window.__lastGoogleIdToken || '';

    setMsgs(m => [...m, { from: 'yo', text: q }]);
    setText('');
    setLoading(true);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', 'X-App-Key': appKey },
        body: JSON.stringify({ text: q, idToken })
      });
      const j = await r.json().catch(() => ({}));
      const reply = j?.reply || j?.error || 'No pude responder.';
      setMsgs(m => [...m, { from: 'bot', text: reply }]);
    } catch {
      setMsgs(m => [...m, { from: 'bot', text: 'Error de red.' }]);
    } finally { setLoading(false); }
  }

  return (
    <div className="flex flex-col h-full">
      <div ref={boxRef} className="flex-1 overflow-auto rounded-lg bg-slate-50 border p-3">
        {msgs.map((m,i)=>(
          <div key={i} className={`my-1 ${m.from==='yo'?'text-right':''}`}>
            <span className={`inline-block px-3 py-2 rounded-lg max-w-[85%] break-words ${m.from==='yo' ? 'bg-[#E3F2FD]' : 'bg-white border'}`}>
              {m.text}
            </span>
          </div>
        ))}
        {msgs.length===0 && (
          <div className="text-slate-500 text-sm">
            Probá: <span className="font-medium">ticket 1234</span> o contame el problema (ej. <span className="italic">impresora no imprime</span>).
          </div>
        )}
      </div>

      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          className="flex-1 border rounded-lg px-3 py-2"
          placeholder={`Escribí acá…`}
          value={text}
          onChange={e=>setText(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading}
          className="px-3 py-2 rounded-lg border text-[#398FFF] border-[#398FFF] hover:bg-[#398FFF] hover:text-white"
        >
          {loading ? '...' : 'Enviar'}
        </button>
      </form>
    </div>
  );
}
