import type { MarketGroup } from "../../../shared/types";

interface MarketCardProps {
  group: MarketGroup;
  onClick?: () => void;
}

function probColor(p: number): string {
  if (p >= 0.5) return "text-success";
  if (p >= 0.3) return "text-warning";
  return "text-danger";
}

function formatVolume(v: number): string {
  if (!v) return "$0";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Math.round(v)}`;
}

function formatProb(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function formatEndDate(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function MarketCard({ group, onClick }: MarketCardProps) {
  // For match groups, use the first market's yes_price as the headline probability.
  // For prediction groups, same thing — there's typically one main market.
  const primary = group.markets[0];
  const prob = primary?.yes_price ?? 0;
  const color = probColor(prob);
  
  const isStarted = group.markets.some((m) => {
    if (!m.game_start_time) return false;
    return new Date(m.game_start_time).getTime() < Date.now();
  });
  const isClosed = group.markets.some((m) => m.closed || !m.active);
  const isLocked = isStarted || isClosed;

  return (
    <button
      onClick={isLocked ? undefined : onClick}
      disabled={isLocked}
      className={`group w-full rounded-md border border-border p-3 text-left transition-colors md:p-4 ${
        isLocked
          ? "bg-card/50 cursor-not-allowed opacity-60"
          : "bg-card active:scale-[0.99] hover:border-muted-foreground/40 hover:bg-accent"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md border border-border bg-background md:h-14 md:w-14">
          {group.image ? (
            <img
              src={group.image}
              alt=""
              className={`h-full w-full object-cover ${isLocked ? "grayscale" : ""}`}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className={`flex h-full w-full items-center justify-center text-lg md:text-xl ${isLocked ? "grayscale opacity-50" : ""}`}>
              ⚽
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
            {group.question}
          </h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-muted-foreground md:text-xs">
            {group.end_date && (
              <span>{formatEndDate(group.end_date)}</span>
            )}
            {group.markets.length > 1 && (
              <>
                <span>·</span>
                <span>{group.markets.length} outcomes</span>
              </>
            )}
          </div>
        </div>

        <div className={`shrink-0 text-xl font-bold tabular-nums md:text-2xl ${isLocked ? "text-muted-foreground" : color}`}>
          {formatProb(prob)}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground md:text-xs">
          {formatVolume(group.volume)} vol
        </span>
        {isLocked ? (
          <span className="rounded-md border border-border bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground md:px-3 md:text-xs">
            {isClosed ? "Closed" : "Started"}
          </span>
        ) : (
          <span className="rounded-md border border-border bg-background px-2.5 py-1 text-[10px] font-medium text-foreground transition-colors group-hover:border-muted-foreground/40 group-hover:bg-accent md:px-3 md:text-xs">
            Predict
          </span>
        )}
      </div>
    </button>
  );
}
