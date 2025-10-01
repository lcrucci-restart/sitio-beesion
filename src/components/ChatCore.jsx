import React, { useState, useEffect, useRef } from 'react';

export default function ChatCore() {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [msgs]);

// helper JSONP
function jsonpCall(url, payload) {
  return new Promise((resolve, reject) => {
    const cb = 'cb_' + Math.random().toString(36).slice(2);
    const s = document.createElement('script');
    const params = new URLSearchParams();
    params.set('callback', cb);
    params.set('body', JSON.stringify(payload));

    let done = false;
    window[cb] = (data) => {
      done = true;
      resolve(data);
      cleanup();
    };
    s.onerror = () => { if (!done) { reject(new Error('JSONP failed')); cleanup(); } };
    s.src = `${url}?${params.toString()}`;
    document.body.appendChild(s);

    function cleanup() {
      try { delete window[cb]; } catch {}
      try { s.parentNode && s.parentNode.removeChild(s); } catch {}
    }
  });
}

async function send(e) {
  e?.preventDefault();
  const q = text.trim();
  if (!q) return;

  const url     = import.meta.env.VITE_GAS_URL; // tu /exec
  const appKey  = import.meta.env.VITE_GAS_APP_KEY || '';
  const idToken = window.__lastGoogleIdToken || '';

  if (!url) {
    setMsgs(m => [...m, { from: 'bot', text: 'No está configurada VITE_GAS_URL.' }]);
    return;
  }

  setMsgs(m => [...m, { from: 'yo', text: q }]);
  setText('');
  setLoading(true);

  try {
    const res = await jsonpCall(url, { text: q, idToken, appKey });
    const reply = res?.reply || res?.error || 'No pude responder.';
    setMsgs(m => [...m, { from: 'bot', text: reply }]);
  } catch (err) {
    console.error('ChatCore JSONP error:', err);
    setMsgs(m => [...m, { from: 'bot', text: 'Error de red.' }]);
  } finally {
    setLoading(false);
  }
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
          placeholder="Escribí acá…"
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
