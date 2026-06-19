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

const STATUS = {
  correct: { label: "WON ✓", bg: "#052e16", color: "#4ade80", border: "#166534" },
  incorrect: { label: "LOST ✗", bg: "#2d0a0a", color: "#f87171", border: "#7f1d1d" },
  pending: { label: "PENDING", bg: "#0f172a", color: "#94a3b8", border: "#334155" },
};

export default function ShareImageModal({ prediction, username, displayName, avatarUrl, onClose }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const isMatch = prediction.type === "match" && prediction.home_team && prediction.away_team;
  const name = displayName || `@${username}`;
  const status = prediction.outcome === "correct"
    ? STATUS.correct
    : prediction.outcome === "incorrect"
    ? STATUS.incorrect
    : STATUS.pending;

  useEffect(() => {
    if (avatarUrl) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = avatarUrl;
    }
  }, [avatarUrl]);

  async function captureBlob() {
    if (!cardRef.current) return null;
    // Wait a tick to ensure DOM paint
    await new Promise((r) => setTimeout(r, 100));
    return toBlob(cardRef.current, {
      cacheBust: true,
      backgroundColor: "#060609",
      pixelRatio: 2,
    });
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
      console.error("Failed to copy image", e);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const blob = await captureBlob();
      if (!blob) return;
      const filename = `vela-prediction-${prediction.id}.png`;
      const file = new File([blob], filename, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "My Vela Prediction" });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      if (e instanceof Error && e.name !== "AbortError") {
        console.error("Failed to share/download image", e);
      }
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)", padding: "16px" }}
      onClick={onClose}
    >
      <div style={{ width: "100%", maxWidth: "440px", display: "flex", flexDirection: "column" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "15px", fontWeight: 600, color: "#f1f5f9", margin: 0 }}>Share Prediction</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "18px", lineHeight: 1 }}>✕</button>
        </div>

        {/* ── Card captured as image ── */}
        <div
          ref={cardRef}
          style={{
            background: "linear-gradient(135deg, #0c0c14 0%, #0f111a 100%)",
            padding: "32px 24px 24px",
            borderRadius: "16px",
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Dot grid background */}
          <div style={{
            position: "absolute", inset: 0,
            backgroundImage: "radial-gradient(circle, #7dd3fc18 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }} />

          {/* Glow */}
          <div style={{ position: "absolute", top: "-60px", right: "-60px", width: "200px", height: "200px", background: "radial-gradient(circle, #7dd3fc22, transparent 70%)", borderRadius: "50%" }} />
          <div style={{ position: "absolute", bottom: "-80px", left: "-40px", width: "180px", height: "180px", background: "radial-gradient(circle, #38bdf820, transparent 70%)", borderRadius: "50%" }} />

          {/* Floating user pill at top center */}
          <div style={{ position: "absolute", top: "-18px", left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: "8px", background: "#1e2130", border: "1.5px solid #2d3348", borderRadius: "999px", padding: "4px 14px 4px 6px", boxShadow: "0 4px 20px #0008" }}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" crossOrigin="anonymous" style={{ width: "26px", height: "26px", borderRadius: "50%", objectFit: "cover", border: "1.5px solid #7dd3fc" }} />
            ) : (
              <div style={{ width: "26px", height: "26px", borderRadius: "50%", background: "#7dd3fc", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "12px", color: "#0c0c14" }}>
                {name.charAt(0).toUpperCase()}
              </div>
            )}
            <span style={{ fontSize: "13px", fontWeight: 600, color: "#f1f5f9", whiteSpace: "nowrap" }}>{name}</span>
          </div>

          {/* Ticket body */}
          <div style={{
            display: "flex",
            background: "#14161f",
            border: "1px solid #1e2235",
            borderRadius: "12px",
            overflow: "hidden",
            marginTop: "8px",
            position: "relative",
            zIndex: 1,
          }}>
            {/* Left panel — match info */}
            <div style={{ flex: 1, padding: "20px 18px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: "16px" }}>
              {/* Sport icon */}
              <div style={{ fontSize: "28px", lineHeight: 1 }}>⚽</div>

              <div>
                <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#7dd3fc", marginBottom: "8px" }}>
                  World Cup 2026
                </div>
                {isMatch ? (
                  <>
                    <div style={{ fontSize: "16px", fontWeight: 800, color: "#f1f5f9", lineHeight: 1.25 }}>
                      {prediction.home_team}
                    </div>
                    <div style={{ fontSize: "10px", fontWeight: 600, color: "#475569", margin: "4px 0", letterSpacing: "0.06em" }}>VS</div>
                    <div style={{ fontSize: "16px", fontWeight: 800, color: "#f1f5f9", lineHeight: 1.25 }}>
                      {prediction.away_team}
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#f1f5f9", lineHeight: 1.4 }}>
                    {prediction.question}
                  </div>
                )}
              </div>
            </div>

            {/* Perforated divider */}
            <div style={{ width: "1px", position: "relative", display: "flex", flexDirection: "column", alignItems: "center" }}>
              {/* Top notch */}
              <div style={{ position: "absolute", top: "-13px", left: "50%", transform: "translateX(-50%)", width: "26px", height: "26px", borderRadius: "50%", background: "linear-gradient(135deg, #0c0c14, #0f111a)" }} />
              {/* Bottom notch */}
              <div style={{ position: "absolute", bottom: "-13px", left: "50%", transform: "translateX(-50%)", width: "26px", height: "26px", borderRadius: "50%", background: "linear-gradient(135deg, #0c0c14, #0f111a)" }} />
              {/* Dashed line */}
              <div style={{ width: "1px", height: "100%", backgroundImage: "repeating-linear-gradient(to bottom, #2d3348 0px, #2d3348 5px, transparent 5px, transparent 10px)" }} />
            </div>

            {/* Right panel — pick + status */}
            <div style={{ width: "140px", flexShrink: 0, padding: "20px 18px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#475569", marginBottom: "6px" }}>
                  My Pick
                </div>
                <div style={{ fontSize: "22px", fontWeight: 900, color: "#7dd3fc", lineHeight: 1.15, wordBreak: "break-word" }}>
                  {prediction.user_pick}
                </div>
              </div>

              <div>
                <div style={{ fontSize: "9px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#475569", marginBottom: "6px" }}>
                  Result
                </div>
                <div style={{
                  display: "inline-block",
                  padding: "4px 10px",
                  borderRadius: "6px",
                  fontSize: "10px",
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  background: status.bg,
                  color: status.color,
                  border: `1px solid ${status.border}`,
                }}>
                  {status.label}
                </div>
              </div>
            </div>
          </div>

          {/* Footer — Vela brand */}
          <div style={{ marginTop: "20px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <img src="/vela.jpg" alt="Vela" style={{ width: "22px", height: "22px", borderRadius: "6px" }} />
              <span style={{ fontSize: "13px", fontWeight: 800, color: "#7dd3fc", letterSpacing: "0.15em", textTransform: "uppercase" }}>Vela</span>
            </div>
            <div style={{ fontSize: "10px", color: "#334155", fontWeight: 500, letterSpacing: "0.06em" }}>
              vela-wc.vercel.app
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ marginTop: "16px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
          <button
            onClick={handleCopy}
            style={{ padding: "12px", borderRadius: "8px", border: "1px solid #1e2235", background: "#14161f", color: "#f1f5f9", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
          >
            {copied ? "Copied ✓" : "Copy Image"}
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            style={{ padding: "12px", borderRadius: "8px", border: "none", background: "#7dd3fc", color: "#0c0c14", fontSize: "13px", fontWeight: 700, cursor: "pointer", opacity: downloading ? 0.6 : 1 }}
          >
            {downloading ? "Saving…" : "Save / Share"}
          </button>
        </div>
      </div>
    </div>
  );
}
