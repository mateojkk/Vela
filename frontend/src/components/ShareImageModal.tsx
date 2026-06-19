import { useRef, useState, useEffect } from "react";
import { toBlob, toPng } from "html-to-image";

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
  const [scale, setScale] = useState(1);
  const [generatedDataUrl, setGeneratedDataUrl] = useState<string | null>(null);

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

  // Adjust scale for mobile screens so the 600px horizontal card fits visually
  useEffect(() => {
    function handleResize() {
      if (window.innerWidth < 640) {
        setScale((window.innerWidth - 32) / 600); // 32px for side padding
      } else {
        setScale(1);
      }
    }
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Pre-generate image for wallet browsers so users can long-press it
  useEffect(() => {
    let mounted = true;
    async function generate() {
      if (!cardRef.current) return;
      await new Promise(r => setTimeout(r, 150)); // let fonts load
      try {
        const url = await toPng(cardRef.current, { 
          cacheBust: true, 
          pixelRatio: 2, 
          backgroundColor: "#ffffff",
          style: { transform: "scale(1)" }
        });
        if (mounted) setGeneratedDataUrl(url);
      } catch (e) {
        console.error("Failed to pre-generate image:", e);
      }
    }
    generate();
    return () => { mounted = false; };
  }, [avatarUrl]);

  async function captureBlob() {
    if (generatedDataUrl) {
      return await (await fetch(generatedDataUrl)).blob();
    }
    if (!cardRef.current) return null;
    return toBlob(cardRef.current, { 
      cacheBust: true, 
      pixelRatio: 2, 
      backgroundColor: "#ffffff",
      style: { transform: "scale(1)" }
    });
  }

  function handleCopy() {
    try {
      // Safari requires a Promise passed synchronously to ClipboardItem
      const promise = captureBlob().then((b) => {
        if (!b) throw new Error("Capture failed");
        return b;
      });
      navigator.clipboard.write([new ClipboardItem({ "image/png": promise })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
      style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)", padding: "16px" }}
      onClick={onClose}
    >
      {/* Modal header (outside the scaled container) */}
      <div style={{ width: "100%", maxWidth: "600px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }} onClick={(e) => e.stopPropagation()}>
        <span style={{ fontSize: "14px", fontWeight: 600, color: "#e2e8f0", fontFamily: font }}>Share Prediction</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "20px", padding: "4px" }}>✕</button>
      </div>

      {/* Scaled container for mobile viewing */}
      <div style={{ width: "600px", transform: `scale(${scale})`, transformOrigin: "center top" }} onClick={(e) => e.stopPropagation()}>
        
        {generatedDataUrl && (
          <img src={generatedDataUrl} alt="Prediction" style={{ width: "600px", borderRadius: "24px", boxShadow: "0 20px 60px rgba(0,0,0,0.1)", display: "block" }} />
        )}

        {/* ─── HORIZONTAL CARD (captured) ─── */}
        {/* We keep it in the DOM but hide it visually once generated, so we don't flash, and we can still generate it */}
        <div ref={cardRef} style={{
          width: "600px", // Strict horizontal width
          background: "#ffffff",
          padding: "32px",
          borderRadius: "24px",
          fontFamily: font,
          position: generatedDataUrl ? "absolute" : "relative",
          visibility: generatedDataUrl ? "hidden" : "visible",
          pointerEvents: generatedDataUrl ? "none" : "auto",
          overflow: "hidden",
          border: "1px solid rgba(0,0,0,0.08)",
          boxShadow: "0 20px 60px rgba(0,0,0,0.1)",
          display: "flex",
          gap: "32px"
        }}>
          
          {/* Ambient Lighting Backgrounds */}
          <div style={{ position: "absolute", bottom: "-100px", right: "-100px", width: "400px", height: "400px", background: "radial-gradient(circle, rgba(0,221,148,0.08) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />
          <div style={{ position: "absolute", top: "-100px", left: "-100px", width: "300px", height: "300px", background: "radial-gradient(circle, rgba(0,0,0,0.03) 0%, transparent 70%)", borderRadius: "50%", pointerEvents: "none" }} />

          {/* LEFT: Match Info & Profile */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", zIndex: 1, gap: "24px" }}>
            
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

              <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <img src="/vela.jpg" alt="Vela" style={{ width: "24px", height: "24px", borderRadius: "6px" }} />
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
          </div>

          {/* RIGHT: The Pick (Inline Status) */}
          <div style={{ width: "240px", flexShrink: 0, background: "#f8fafc", borderRadius: "16px", padding: "24px", border: "1px solid rgba(0,0,0,0.05)", display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", zIndex: 1 }}>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <span style={{ fontSize: "11px", fontWeight: 600, color: "#9ca3af", letterSpacing: "0.1em", textTransform: "uppercase" }}>Selected Pick</span>
              <div style={{ fontSize: "28px", fontWeight: 300, color: pickColor, lineHeight: 1.15, letterSpacing: "-0.02em", wordBreak: "break-word" }}>
                {prediction.user_pick}
              </div>
            </div>
            
            <div style={{ marginTop: "24px", padding: "10px 16px", borderRadius: "12px", background: statusBg, border: `1px solid ${statusColor}40`, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: "14px", fontWeight: 800, color: statusColor, letterSpacing: "0.1em" }}>
                {statusLabel}
              </span>
            </div>

          </div>
        </div>
      </div>

      {generatedDataUrl && (
        <div style={{ width: "100%", maxWidth: "600px", marginTop: "16px", textAlign: "center", fontSize: "12px", color: "#94a3b8", fontFamily: font }}>
          Tip: You can long-press the image to save it.
        </div>
      )}

      {/* Action buttons (outside scaled wrapper) */}
      <div style={{ width: "100%", maxWidth: "600px", marginTop: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }} onClick={(e) => e.stopPropagation()}>
        <button onClick={handleCopy} style={{ padding: "14px", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer", fontFamily: font, transition: "background 0.2s" }}>
          {copied ? "Copied ✓" : "Copy Image"}
        </button>
        <button onClick={handleDownload} disabled={downloading} style={{ padding: "14px", borderRadius: "14px", border: "none", background: "#00DD94", color: "#000", fontSize: "14px", fontWeight: 700, cursor: "pointer", fontFamily: font, opacity: downloading ? 0.6 : 1, transition: "opacity 0.2s" }}>
          {downloading ? "Saving…" : "Save / Share"}
        </button>
      </div>

    </div>
  );
}
