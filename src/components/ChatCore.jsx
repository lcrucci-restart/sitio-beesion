// src/components/ChatCore.jsx
import React, { useEffect, useRef, useState } from "react";

export default function ChatCore() {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  // scroll al final cuando llegan mensajes nuevos
  useEffect(() => {
    if (boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
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

      const replyText = res?.reply || res?.error || "Sin respuesta.";
      setMsgs((m) => [...m, { from: "bot", text: replyText }]);
    } catch (err) {
      console.error("ChatCore JSONP error:", err);
      setMsgs((m) => [...m, { from: "bot", text: "Error de red." }]);
    } finally {
      setLoading(false);
    }
  }

  // ---------- render de texto con formato ----------

  function renderBotMessage(text) {
    const s = String(text || "");

    // Heurística MUY simple: si arranca con "Nro:" lo tratamos como detalle de ticket
    const isTicketReply = /^Nro:\s*/i.test(s);

    if (!isTicketReply) {
      // mensaje normal → respetar saltos de línea
      return (
        <span style={{ whiteSpace: "pre-line" }}>
          {s}
        </span>
      );
    }

    const lines = s.split("\n").map((ln) => ln.trim()).filter(Boolean);

    return (
      <div className="text-xs text-left">
        <div className="text-[11px] font-semibold text-slate-500 mb-1">
          Detalle del ticket
        </div>
        {lines.map((ln, idx) => {
          const [label, ...rest] = ln.split(":");
          const value = rest.join(":").trim();

          if (!value) {
            // por si hay líneas tipo "Descripción:" o texto suelto
            return (
              <div key={idx} className="mt-2">
                {ln}
              </div>
            );
          }

          return (
            <div key={idx} className="mt-0.5">
              <span className="font-semibold">{label.trim()}:</span>{" "}
              <span>{value}</span>
            </div>
          );
        })}
      </div>
    );
  }

  function renderMessage(m) {
    const isUser = m.from === "yo";

    return (
      <div className={`my-1 ${isUser ? "text-right" : "text-left"}`}>
        <div
          className={
            "inline-block px-3 py-2 rounded-lg max-w-[85%] break-words " +
            (isUser ? "bg-[#E3F2FD]" : "bg-white border")
          }
        >
          {isUser ? (
            <span style={{ whiteSpace: "pre-line" }}>{m.text}</span>
          ) : (
            renderBotMessage(m.text)
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div
        ref={boxRef}
        className="flex-1 overflow-auto rounded-lg bg-slate-50 border p-3"
      >
        {msgs.map((m, i) => (
          <React.Fragment key={i}>{renderMessage(m)}</React.Fragment>
        ))}

        {msgs.length === 0 && (
          <div className="text-slate-500 text-sm">
            Probá:{" "}
            <span className="font-medium">ticket 98532</span> o una frase como{" "}
            <span className="italic">"hablame sobre invgate 32322"</span>.
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
          className="px-3 py-2 rounded-lg border text-[#398FFF] border-[#398FFF] hover:bg-[#398FFF] hover:text-white disabled:opacity-60"
        >
          {loading ? "..." : "Enviar"}
        </button>
      </form>
    </div>
  );
}
