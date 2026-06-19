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
  
  // Status pill
  let statusLabel = "PENDING";
  let statusColor = "#64748b";
  let statusBg = "rgba(0,0,0,0.05)";
  if (outcome === "correct") {
    statusLabel = "WON ✓";
    statusColor = "#00DD94";
    statusBg = "rgba(0, 221, 148, 0.15)";
  } else if (outcome === "incorrect") {
    statusLabel = "LOST ✗";
    statusColor = "#ef4444";
    statusBg = "rgba(239, 68, 68, 0.1)";
  }

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
    return toBlob(cardRef.current, { cacheBust: true, pixelRatio: 2, backgroundColor: "#000000" });
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

  const font = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)", padding: "16px" }}
      onClick={onClose}
    >
      <div style={{ width: "100%", maxWidth: "540px" }} onClick={(e) => e.stopPropagation()}>
        
        {/* Modal header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <span style={{ fontSize: "14px", fontWeight: 600, color: "#e2e8f0", fontFamily: font }}>Share Prediction</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "20px", padding: "4px" }}>✕</button>
        </div>

        {/* ─── NEW PREMIUM CARD (captured) ─── */}
        <div ref={cardRef} style={{
          background: "#ffffff",
          padding: "32px",
          borderRadius: "24px",
          fontFamily: font,
          position: "relative",
          overflow: "hidden",
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,1)",
        }}>
          
          {/* Subtle green ambient light from the bottom right */}
          <div style={{ position: "absolute", bottom: "-100px", right: "-100px", width: "400px", height: "400px", background: "radial-gradient(circle, rgba(0,221,148,0.08) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
          {/* Top left ambient */}
          <div style={{ position: "absolute", top: "-100px", left: "-100px", width: "300px", height: "300px", background: "radial-gradient(circle, rgba(0,0,0,0.03) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />



          <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", gap: "32px" }}>
            
            {/* Header: User & App Brand */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                {avatarUrl
                  ? <img src={avatarUrl} alt="" crossOrigin="anonymous" style={{ width: "28px", height: "28px", borderRadius: "50%", objectFit: "cover", border: "1px solid rgba(0,0,0,0.1)" }} />
                  : <div style={{ width: "28px", height: "28px", borderRadius: "50%", background: "rgba(0,0,0,0.05)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "12px", color: "#0a0a0a", border: "1px solid rgba(0,0,0,0.1)" }}>{name.charAt(0).toUpperCase()}</div>
                }
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <span style={{ fontSize: "12px", fontWeight: 600, color: "#0a0a0a", letterSpacing: "0.01em" }}>{name}</span>
                  <span style={{ fontSize: "9px", fontWeight: 500, color: "#64748b", letterSpacing: "0.04em" }}>PREDICTION</span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "6px", background: "rgba(0,0,0,0.04)", padding: "4px 8px", borderRadius: "999px", border: "1px solid rgba(0,0,0,0.08)" }}>
                <img src="/vela.jpg" alt="Vela" style={{ width: "12px", height: "12px", borderRadius: "3px" }} />
                <span style={{ fontSize: "9px", fontWeight: 700, color: "#0a0a0a", letterSpacing: "0.1em" }}>VELA</span>
              </div>
            </div>

            {/* Match Information */}
            <div>
              <div style={{ fontSize: "10px", fontWeight: 700, color: "#00DD94", letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "12px" }}>
                World Cup 2026
              </div>
              
              {isMatch ? (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  <div style={{ fontSize: "28px", fontWeight: 800, color: "#0a0a0a", lineHeight: 1.1, letterSpacing: "-0.03em" }}>{prediction.home_team}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                    <div style={{ flex: 1, height: "1px", background: "linear-gradient(90deg, rgba(0,0,0,0.1), transparent)" }} />
                    <span style={{ fontSize: "11px", fontWeight: 600, color: "#64748b", fontStyle: "italic" }}>vs</span>
                    <div style={{ flex: 1, height: "1px", background: "linear-gradient(270deg, rgba(0,0,0,0.1), transparent)" }} />
                  </div>
                  <div style={{ fontSize: "28px", fontWeight: 800, color: "#0a0a0a", lineHeight: 1.1, letterSpacing: "-0.03em", textAlign: "right" }}>{prediction.away_team}</div>
                </div>
              ) : (
                <div style={{ fontSize: "24px", fontWeight: 700, color: "#0a0a0a", lineHeight: 1.3, letterSpacing: "-0.02em" }}>
                  {prediction.question}
                </div>
              )}
            </div>

            {/* The Pick */}
            <div style={{ background: "#f8fafc", borderRadius: "16px", padding: "24px", border: "1px solid rgba(0,0,0,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <span style={{ fontSize: "11px", fontWeight: 600, color: "#9ca3af", letterSpacing: "0.1em", textTransform: "uppercase" }}>Selected Pick</span>
                <div style={{ fontSize: "36px", fontWeight: 300, color: pickColor, lineHeight: 1.1, letterSpacing: "-0.02em", wordBreak: "break-word" }}>
                  {prediction.user_pick}
                </div>
              </div>
              <div style={{ padding: "10px 20px", borderRadius: "12px", background: statusBg, border: `1px solid ${statusColor}40`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: "16px", fontWeight: 800, color: statusColor, letterSpacing: "0.08em" }}>
                  {statusLabel}
                </span>
              </div>
            </div>

          </div>
        </div>

        {/* Action buttons */}
        <div style={{ marginTop: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <button onClick={handleCopy} style={{ padding: "14px", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer", fontFamily: font, transition: "background 0.2s" }}>
            {copied ? "Copied ✓" : "Copy Image"}
          </button>
          <button onClick={handleDownload} disabled={downloading} style={{ padding: "14px", borderRadius: "14px", border: "none", background: "#00DD94", color: "#000", fontSize: "14px", fontWeight: 700, cursor: "pointer", fontFamily: font, opacity: downloading ? 0.6 : 1, transition: "opacity 0.2s" }}>
            {downloading ? "Saving…" : "Save / Share"}
          </button>
        </div>
      </div>
    </div>
  );
}
