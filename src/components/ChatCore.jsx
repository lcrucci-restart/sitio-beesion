// src/components/ChatCore.jsx
import React, { useEffect, useRef, useState } from "react";

export default function ChatCore() {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [msgs]);

  function jsonpCall(url) {
    return new Promise((resolve, reject) => {
      const cbName = "cb_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("JSONP timeout"));
      }, 12000);

      function cleanup() {
        clearTimeout(timeout);
        delete window[cbName];
        script.remove();
      }

      window[cbName] = (data) => {
        cleanup();
        resolve(data);
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("JSONP failed"));
      };

      const sep = url.includes("?") ? "&" : "?";
      script.src = `${url}${sep}callback=${encodeURIComponent(cbName)}`;
      document.body.appendChild(script);
    });
  }

  async function send(e) {
    e?.preventDefault();
    const q = text.trim();
    if (!q) return;

    const url = import.meta.env.VITE_GAS_URL;          // https://script.google.com/.../exec
    const appKey = import.meta.env.VITE_GAS_APP_KEY;   // mismo APP_KEY que en GAS
    const idToken = window.__lastGoogleIdToken || "";  // lo pone AuthGate

    setMsgs((m) => [...m, { from: "yo", text: q }]);
    setText("");
    setLoading(true);
    try {
      const body = JSON.stringify({ text: q, appKey, idToken });
      const full = `${url}?body=${encodeURIComponent(body)}`;
      const res = await jsonpCall(full);
      const reply = res?.reply || res?.error || "Sin respuesta.";
      setMsgs((m) => [...m, { from: "bot", text: reply }]);
    } catch (err) {
      console.error("ChatCore JSONP error:", err);
      setMsgs((m) => [...m, { from: "bot", text: "Error de red." }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      <div ref={boxRef} className="flex-1 overflow-auto rounded-lg bg-slate-50 border p-3">
        {msgs.map((m, i) => (
          <div key={i} className={`my-1 ${m.from === "yo" ? "text-right" : ""}`}>
            <span
              className={`inline-block px-3 py-2 rounded-lg max-w-[85%] break-words ${
                m.from === "yo" ? "bg-[#E3F2FD]" : "bg-white border"
              }`}
            >
              {m.text}
            </span>
          </div>
        ))}
        {msgs.length === 0 && (
          <div className="text-slate-500 text-sm">
            Probá: <span className="font-medium">ticket 98532</span> o decime el problema (ej.{" "}
            <span className="italic">impresora no imprime</span>).
          </div>
        )}
      </div>

      <form onSubmit={send} className="mt-3 flex gap-2">
        <input
          className="flex-1 border rounded-lg px-3 py-2"
          placeholder="Escribí acá…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          type="submit"
          disabled={loading}
          className="px-3 py-2 rounded-lg border text-[#398FFF] border-[#398FFF] hover:bg-[#398FFF] hover:text-white"
        >
          {loading ? "..." : "Enviar"}
        </button>
      </form>
    </div>
  );
}

