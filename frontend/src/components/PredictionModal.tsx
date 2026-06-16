import { useState, useEffect } from "react";
import { apiPost } from "../lib/api";
import { useMemWal } from "../hooks/useMemWal";
import ShareButton from "./ShareButton";
import type { MarketGroup, MarketSubMarket } from "../../../shared/types";

interface Props {
  marketGroup: MarketGroup | null;
  user: { email: string };
  onClose: () => void;
}

interface OutcomeOption {
  id: string;
  label: string;
  subMarket: MarketSubMarket;
  side: "yes" | "no";
  probability: number;
}

function buildOptionsForGroup(group: MarketGroup): OutcomeOption[] {
  const out: OutcomeOption[] = [];
  const match = group.match;
  const subs = group.markets || [];

  if (match) {
    // Match-style market: "Brazil vs Portugal"
    // - sub-markets of form "Will X win on DATE?" → option "X"
    // - sub-market of form "Will X vs Y end in a draw?" → option "Draw"
    const home = match.home;
    const away = match.away;

    for (const m of subs) {
      const q = m.question.toLowerCase();

      // Draw?
      if (q.includes("end in a draw") || q.includes("draw")) {
        out.push({
          id: `draw-${m.id}`,
          label: "Draw",
          subMarket: m,
          side: "yes",
          probability: m.yes_price,
        });
        continue;
      }

      // Home win?
      if (home && q.includes(`will ${home.toLowerCase()} win`)) {
        out.push({
          id: `home-${m.id}`,
          label: home,
          subMarket: m,
          side: "yes",
          probability: m.yes_price,
        });
        continue;
      }

      // Away win?
      if (away && q.includes(`will ${away.toLowerCase()} win`)) {
        out.push({
          id: `away-${m.id}`,
          label: away,
          subMarket: m,
          side: "yes",
          probability: m.yes_price,
        });
        continue;
      }

      // Fallback: if question is generic, use it as label
      if (q.startsWith("will ")) {
        const cleaned = m.question
          .replace(/^Will\s+/i, "")
          .replace(/\s+on\s+\d{4}-\d{2}-\d{2}\?*$/i, "")
          .replace(/\?$/, "")
          .trim();
        if (cleaned) {
          out.push({
            id: `custom-${m.id}`,
            label: cleaned,
            subMarket: m,
            side: "yes",
            probability: m.yes_price,
          });
        }
      }
    }

    // If parsing didn't find home/away wins, fall back to two Yes/No from the
    // first sub-market (still uses team names as labels).
    if (out.length === 0 && home && away && subs[0]) {
      out.push(
        {
          id: `home-fallback-${subs[0].id}`,
          label: home,
          subMarket: subs[0],
          side: "yes",
          probability: subs[0].yes_price,
        },
        {
          id: `away-fallback-${subs[0].id}`,
          label: away,
          subMarket: subs[0],
          side: "no",
          probability: subs[0].no_price,
        }
      );
    }
  } else {
    // Non-match market: Yes / No
    if (subs[0]) {
      out.push(
        {
          id: `yes-${subs[0].id}`,
          label: "Yes",
          subMarket: subs[0],
          side: "yes",
          probability: subs[0].yes_price,
        },
        {
          id: `no-${subs[0].id}`,
          label: "No",
          subMarket: subs[0],
          side: "no",
          probability: subs[0].no_price,
        }
      );
    }
  }

  return out;
}

function formatCents(p: number): string {
  return `${Math.round(p * 100)}¢`;
}

export default function PredictionModal({ marketGroup, user, onClose }: Props) {
  const { memwal, authorized, remember } = useMemWal();
  const [selected, setSelected] = useState<OutcomeOption | null>(null);
  const [confidence, setConfidence] = useState(5);
  const [take, setTake] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ pred_id: string; vela_pick: string } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!marketGroup) return null;

  const options = buildOptionsForGroup(marketGroup);
  const match = marketGroup.match;
  const isMatch = !!match;

  // Deduplicate by label for display (one entry per outcome)
  const seen = new Set<string>();
  const uniqueOptions = options.filter((o) => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setLoading(true);
    try {
      const data = await apiPost<{
        prediction_id: string;
        vela_pick: string;
        memory_texts: {
          remember: string;
          analyze: string;
          vela_remember: string | null;
          vela_analyze: string | null;
        };
      }>("/predict", {
        user_email: user.email,
        type: "market",
        external_id: selected.subMarket.id,
        user_pick: selected.label,
        confidence,
        take: take || undefined,
        question: marketGroup!.question,
        market_id: marketGroup!.id,
        market_question: marketGroup!.question,
        side: selected.side,
        price_at_prediction: selected.probability,
        is_match: isMatch,
        home_team: match?.home,
        away_team: match?.away,
      });
      setResult({ pred_id: data.prediction_id, vela_pick: data.vela_pick });

      // Write prediction memories to Walrus from the frontend.
      if (memwal && authorized) {
        const { memory_texts } = data;
        const writes: Promise<unknown>[] = [
          remember(memory_texts.remember),
          remember(memory_texts.analyze),
        ];
        if (memory_texts.vela_remember) {
          writes.push(remember(memory_texts.vela_remember));
        }
        if (memory_texts.vela_analyze) {
          writes.push(remember(memory_texts.vela_analyze));
        }
        Promise.all(writes).catch((err) => {
          console.error("Prediction memory write failed:", err);
        });
      }
    } catch {
      setError("Something broke. Even predictions have off days. Try again.");
    }
    setLoading(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 font-mono backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-md border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {result ? (
          <div className="py-8 text-center">
            <img
              src="/vela.jpg"
              className="mx-auto mb-4 h-12 w-12 rounded-md object-cover"
              alt="Vela"
            />
            <h3 className="mb-2 text-lg font-semibold text-foreground">
              Prediction locked in
            </h3>
            <p className="mb-3 text-sm text-muted-foreground">
              I picked{" "}
              <span className="font-semibold text-foreground">
                {selected?.label}
              </span>{" "}
              for{" "}
              <span className="font-semibold text-foreground">
                {marketGroup.question}
              </span>
              . Come back later — I'll tell you if I was right.
            </p>
            {result.vela_pick && (
              <div className="mb-6 rounded-md border border-border bg-background p-3 text-left">
                <p className="mb-1 text-xs text-muted-foreground">
                  Vela agrees with{" "}
                  <span className="font-semibold text-primary">
                    {formatCents(selected?.probability ?? 0)}
                  </span>{" "}
                  confidence
                </p>
              </div>
            )}
            <button
              onClick={onClose}
              className="rounded-md border border-border bg-background px-6 py-2 text-foreground hover:bg-accent"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {/* Header */}
            <div className="mb-4 flex items-center gap-3">
              {marketGroup.image ? (
                <img
                  src={marketGroup.image}
                  className="h-10 w-10 shrink-0 rounded-md border border-border object-cover"
                  alt=""
                />
              ) : (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border bg-background text-lg">
                  ⚽
                </div>
              )}
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-semibold text-foreground">
                  {marketGroup.question}
                </h3>
                <p className="text-xs text-muted-foreground">
                  {isMatch ? "Match prediction" : "Prediction market"}
                </p>
              </div>
              <ShareButton
                url={`${window.location.origin}/api/og?type=market&id=${encodeURIComponent(marketGroup.markets[0]?.id || marketGroup.id)}`}
                title={marketGroup.question}
                text={`${marketGroup.question} on Vela — currently ${formatCents(marketGroup.markets[0]?.yes_price ?? 0)} on Yes.`}
              />
            </div>

            {/* Match-up display */}
            {isMatch && match && (
              <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-md border border-border bg-background p-4">
                <div className="text-center">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {match.home}
                  </div>
                </div>
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  vs
                </div>
                <div className="text-center">
                  <div className="truncate text-sm font-semibold text-foreground">
                    {match.away}
                  </div>
                </div>
              </div>
            )}

            {/* Outcome options */}
            <div className="mb-4">
              <label className="mb-2 block text-sm text-muted-foreground">
                Your pick
              </label>
              {uniqueOptions.length === 0 ? (
                <div className="rounded-md border border-border bg-background p-3 text-center text-xs text-muted-foreground">
                  No outcomes available for this market yet.
                </div>
              ) : (
                <div className={`grid gap-2 ${isMatch && uniqueOptions.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
                  {uniqueOptions.map((opt) => {
                    const isYes = opt.side === "yes";
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setSelected(opt)}
                        className={`relative rounded-md border px-3 py-3 text-sm font-medium transition-colors ${
                          selected?.id === opt.id
                            ? isYes
                              ? "border-success/60 bg-success/10 text-foreground"
                              : "border-danger/60 bg-danger/10 text-foreground"
                            : "border-border bg-background text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                        }`}
                      >
                        <div className="truncate">{opt.label}</div>
                        <div
                          className={`mt-1 text-[10px] font-mono tabular-nums ${
                            selected?.id === opt.id
                              ? "text-foreground"
                              : "text-muted-foreground"
                          }`}
                        >
                          {formatCents(opt.probability)}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sub-markets under this event */}
            {!isMatch && marketGroup.markets.length > 1 && (
              <div className="mb-4">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  Related markets
                </div>
                <div className="space-y-1.5">
                  {marketGroup.markets.slice(0, 6).map((m) => (
                    <div
                      key={m.id}
                      className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground"
                    >
                      <div className="truncate">{m.question}</div>
                      <div className="mt-0.5 font-mono tabular-nums">
                        Yes {formatCents(m.yes_price)} · No{" "}
                        {formatCents(m.no_price)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className="mb-2 block text-sm text-muted-foreground">
                Confidence:{" "}
                <span className="font-medium text-foreground">
                  {confidence}/10
                </span>
              </label>
              <input
                type="range"
                min={1}
                max={10}
                value={confidence}
                onChange={(e) => setConfidence(Number(e.target.value))}
                className="w-full accent-sky-500"
              />
            </div>

            <div className="mb-6">
              <label className="mb-2 block text-sm text-muted-foreground">
                Hot take{" "}
                <span className="opacity-60">(optional)</span>
              </label>
              <textarea
                value={take}
                onChange={(e) => setTake(e.target.value)}
                placeholder="e.g. Mbappe is overrated at tournaments"
                rows={2}
                className="w-full resize-none rounded-md border border-border bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-muted-foreground focus:outline-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-md border border-border bg-background py-3 text-muted-foreground hover:border-muted-foreground/40"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!selected || loading}
                className="flex-1 rounded-md border border-border bg-background py-3 font-medium text-foreground hover:border-muted-foreground/40 hover:bg-accent disabled:opacity-50"
              >
                {loading ? "Vela is storing..." : "Lock it in"}
              </button>
            </div>
            {error && (
              <p className="mt-3 text-center text-sm text-danger">{error}</p>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
