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
  const context = isMatch
    ? `${prediction.home_team} vs ${prediction.away_team}`
    : prediction.question || (prediction.type === "match" ? "Match" : "Market");

  const name = displayName || `@${username}`;

  // Preload fonts/images to ensure html-to-image captures them correctly
  useEffect(() => {
    if (avatarUrl) {
      const img = new Image();
      img.src = avatarUrl;
    }
  }, [avatarUrl]);

  async function handleCopy() {
    if (!cardRef.current) return;
    try {
      const blob = await toBlob(cardRef.current, {
        cacheBust: true,
        backgroundColor: "#0e0e0f",
        style: { transform: "scale(1)", transformOrigin: "top left" },
        width: cardRef.current.offsetWidth,
        height: cardRef.current.offsetHeight,
      });
      if (blob) {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (e) {
      console.error("Failed to copy image", e);
    }
  }

  async function handleDownload() {
    if (!cardRef.current) return;
    setDownloading(true);
    try {
      const blob = await toBlob(cardRef.current, {
        cacheBust: true,
        backgroundColor: "#0e0e0f",
      });
      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `vela-prediction-${prediction.id}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error("Failed to download image", e);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-foreground">Share Prediction</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {/* The Card to be captured */}
        <div className="bg-[#0e0e0f] p-4 rounded-xl shadow-2xl border border-border" ref={cardRef}>
          <div className="bg-card border border-border rounded-lg p-6 relative overflow-hidden">
            {/* Background embellishment */}
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/20 blur-3xl rounded-full" />
            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-accent/20 blur-3xl rounded-full" />

            <div className="relative z-10 flex flex-col gap-6">
              <div className="flex items-center gap-3">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-10 h-10 rounded-full border-2 border-background object-cover" crossOrigin="anonymous" />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center font-bold text-foreground">
                    {name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="font-bold text-foreground text-sm leading-tight">{name}</div>
                  <div className="text-xs text-muted-foreground">@{username} on Vela</div>
                </div>
              </div>

              <div>
                <div className="text-[10px] font-bold uppercase tracking-widest text-primary mb-2">
                  World Cup 2026 Call
                </div>
                <h2 className="text-xl md:text-2xl font-black text-foreground leading-tight mb-4">
                  {context}
                </h2>
                <div className="inline-flex flex-col border-l-2 border-primary pl-3 py-1">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Pick</span>
                  <span className="text-lg font-bold text-foreground">{prediction.user_pick}</span>
                </div>
              </div>

              <div className="pt-4 border-t border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img src="/vela.jpg" alt="Vela logo" className="w-6 h-6 rounded-md" />
                  <span className="font-bold text-sm tracking-widest uppercase">Vela</span>
                </div>
                <div className={`text-xs font-bold uppercase tracking-widest px-2 py-1 rounded bg-background border ${prediction.outcome === "correct" ? "text-success border-success/30" : prediction.outcome === "incorrect" ? "text-danger border-danger/30" : "text-muted-foreground border-border"}`}>
                  {prediction.outcome === "correct" ? "Won" : prediction.outcome === "incorrect" ? "Lost" : "Pending"}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button
            onClick={handleCopy}
            className="w-full flex justify-center items-center gap-2 rounded-md bg-accent text-foreground py-2.5 text-sm font-semibold hover:bg-accent/80 transition-colors"
          >
            {copied ? "Copied!" : "Copy Image"}
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full flex justify-center items-center gap-2 rounded-md bg-primary text-background py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {downloading ? "Saving..." : "Download"}
          </button>
        </div>
      </div>
    </div>
  );
}
