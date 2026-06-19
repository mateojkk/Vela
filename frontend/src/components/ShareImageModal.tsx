import { useRef, useState, useEffect } from "react";
import { toBlob } from "html-to-image";

interface Props {
  prediction: {
    id: string;
    type: string;
    user_pick: string;
    home_team: string | null;
    away_team: string | null;
    question: string | null;
    outcome: string | null;
  };
  username: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  onClose: () => void;
}

export default function ShareImageModal({ prediction, username, displayName, avatarUrl, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const isMatch = prediction.type === "match" && prediction.home_team && prediction.away_team;
  const name = displayName || `@${username}`;

  const outcome = prediction.outcome;
  const pickColor = outcome === "correct" ? "#00DD94" : outcome === "incorrect" ? "#ef4444" : "#00DD94";
  const statusLabel = outcome === "correct" ? "WON" : outcome === "incorrect" ? "LOST" : "PENDING";
  const statusColor = outcome === "correct" ? "#00DD94" : outcome === "incorrect" ? "#ef4444" : "#9ca3af";

  useEffect(() => {
    if (avatarUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = avatarUrl;
    }
  }, [avatarUrl]);

  async function captureBlob() {
    if (!cardRef.current) return null;
    await new Promise((r) => setTimeout(r, 150));
    return toBlob(cardRef.current, { cacheBust: true, pixelRatio: 2 });
  }

  async function handleCopy() {
    try {
      const blob = await captureBlob();
      if (blob) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const blob = await captureBlob();
      if (!blob) return;
      const filename = `vela-${prediction.id}.png`;
      const file = new File([blob], filename, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "My Vela Prediction" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
      }
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") console.error(e);
    } finally {
      setDownloading(false);
    }
  }

  const matchLine = isMatch
    ? `${prediction.home_team} vs. ${prediction.away_team}`
    : prediction.question || "Match Prediction";

  const font = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.88)", backdropFilter: "blur(10px)", padding: "16px" }}
      onClick={onClose}
    >
      <div style={{ width: "100%", maxWidth: "540px" }} onClick={(e) => e.stopPropagation()}>

        {/* Modal header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <span style={{ fontSize: "14px", fontWeight: 600, color: "#e2e8f0", fontFamily: font }}>Share</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "20px", padding: "4px" }}>✕</button>
        </div>

        {/* ─── CARD (captured) ─── */}
        <div ref={cardRef} style={{
          background: "#0a0a0a",
          padding: "56px 32px 32px",
          borderRadius: "24px",
          fontFamily: font,
          position: "relative",
          overflow: "hidden",
        }}>

          {/* Dot grid texture */}
          <div style={{
            position: "absolute", inset: 0, borderRadius: "24px",
            backgroundImage: "radial-gradient(circle, rgba(0,221,148,0.12) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }} />



          {/* Avatar pill — floats over the top edge */}
          <div style={{
            position: "absolute", top: "20px", left: "50%", transform: "translateX(-50%)",
            display: "flex", alignItems: "center", gap: "10px",
            background: "rgba(255,255,255,0.07)", backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: "999px", padding: "6px 16px 6px 6px",
            whiteSpace: "nowrap",
          }}>
            {avatarUrl
              ? <img src={avatarUrl} alt="" crossOrigin="anonymous" style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover", border: "1.5px solid #00DD94" }} />
              : <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#00DD94", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "14px", color: "#001a0d" }}>{name.charAt(0).toUpperCase()}</div>
            }
            <span style={{ fontSize: "14px", fontWeight: 600, color: "#f8fafc", letterSpacing: "0.01em" }}>{name}</span>
          </div>

          {/* White ticket */}
          <div style={{
            background: "#ffffff",
            borderRadius: "16px",
            display: "flex",
            overflow: "visible",
            position: "relative",
            boxShadow: "0 24px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)",
          }}>

            {/* LEFT — match info */}
            <div style={{ flex: 1, padding: "32px 28px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "24px", minWidth: 0 }}>

              {/* Top: ball + brand */}
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                {/* Soccer ball SVG */}
                <svg width="44" height="44" viewBox="0 0 36 36" fill="none">
                  <circle cx="18" cy="18" r="17" stroke="#0a0a0a" strokeWidth="2" fill="none"/>
                  <path d="M18 4 L22 10 L16 14 L12 10 Z" fill="#0a0a0a"/>
                  <path d="M28 11 L32 16 L27 20 L22 16 Z" fill="#0a0a0a"/>
                  <path d="M30 24 L25 28 L21 23 L25 18 Z" fill="#0a0a0a"/>
                  <path d="M18 32 L13 28 L16 22 L22 22 L25 28 Z" fill="#0a0a0a"/>
                  <path d="M6 24 L11 18 L15 23 L13 28 Z" fill="#0a0a0a"/>
                  <path d="M4 16 L9 11 L14 15 L11 20 Z" fill="#0a0a0a"/>
                </svg>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span style={{ fontSize: "15px", fontWeight: 700, color: "#0a0a0a", letterSpacing: "-0.01em" }}>Vela</span>
                  <span style={{ fontSize: "11px", fontWeight: 500, color: "#9ca3af", letterSpacing: "0.04em" }}>World Cup 2026</span>
                </div>
              </div>

              {/* Match question */}
              <div>
                <div style={{ fontSize: "24px", fontWeight: 800, color: "#0a0a0a", lineHeight: 1.25, letterSpacing: "-0.02em" }}>
                  {matchLine}
                </div>
              </div>
            </div>

            {/* Divider with half-circle notches */}
            <div style={{ width: "1px", position: "relative", flexShrink: 0 }}>
              <div style={{ position: "absolute", top: "-16px", left: "50%", transform: "translateX(-50%)", width: "32px", height: "32px", borderRadius: "50%", background: "#0a0a0a" }} />
              <div style={{ position: "absolute", bottom: "-16px", left: "50%", transform: "translateX(-50%)", width: "32px", height: "32px", borderRadius: "50%", background: "#0a0a0a" }} />
              <div style={{ width: "1px", height: "100%", background: "repeating-linear-gradient(to bottom, #cbd5e1 0px, #cbd5e1 6px, transparent 6px, transparent 14px)" }} />
            </div>

            {/* RIGHT — pick + outcome */}
            <div style={{ width: "180px", flexShrink: 0, padding: "32px 24px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "#9ca3af", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>My Pick</div>
                <div style={{ fontSize: "38px", fontWeight: 300, color: pickColor, lineHeight: 1.05, letterSpacing: "-0.02em", wordBreak: "break-word" }}>
                  {prediction.user_pick}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "#9ca3af", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "8px" }}>Result</div>
                <div style={{ fontSize: "15px", fontWeight: 800, color: statusColor, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                  {statusLabel}
                </div>
              </div>
            </div>
          </div>

          {/* Footer — logo only, centered */}
          <div style={{ marginTop: "28px", display: "flex", justifyContent: "center", position: "relative", zIndex: 1 }}>
            <img src="/vela.jpg" alt="Vela" style={{ width: "40px", height: "40px", borderRadius: "10px", boxShadow: "0 2px 16px rgba(0,0,0,0.4)" }} />
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ marginTop: "14px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
          <button onClick={handleCopy} style={{ padding: "12px", borderRadius: "10px", border: "1px solid #1e293b", background: "#0f172a", color: "#f8fafc", fontSize: "13px", fontWeight: 600, cursor: "pointer", fontFamily: font }}>
            {copied ? "Copied ✓" : "Copy Image"}
          </button>
          <button onClick={handleDownload} disabled={downloading} style={{ padding: "12px", borderRadius: "10px", border: "none", background: "#00DD94", color: "#001a0d", fontSize: "13px", fontWeight: 700, cursor: "pointer", fontFamily: font, opacity: downloading ? 0.6 : 1 }}>
            {downloading ? "Saving…" : "Save / Share"}
          </button>
        </div>
      </div>
    </div>
  );
}
