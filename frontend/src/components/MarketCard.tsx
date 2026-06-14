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

  return (
    <button
      onClick={onClick}
      className="group w-full rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-muted-foreground/40 hover:bg-accent"
    >
      <div className="flex items-start gap-3">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-background">
          {group.image ? (
            <img
              src={group.image}
              alt=""
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xl">
              ⚽
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
            {group.question}
          </h3>
          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            {group.match ? (
              <span className="font-mono uppercase tracking-wider">
                Match
              </span>
            ) : (
              <span className="font-mono uppercase tracking-wider">
                Market
              </span>
            )}
            {group.end_date && (
              <>
                <span>·</span>
                <span>{formatEndDate(group.end_date)}</span>
              </>
            )}
            {group.markets.length > 1 && (
              <>
                <span>·</span>
                <span>{group.markets.length} markets</span>
              </>
            )}
          </div>
        </div>

        <div className={`shrink-0 text-2xl font-bold tabular-nums ${color}`}>
          {formatProb(prob)}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          Vol {formatVolume(group.volume)}
        </span>
        <span className="rounded-md border border-border bg-background px-3 py-1 text-xs font-medium text-foreground transition-colors group-hover:border-muted-foreground/40 group-hover:bg-accent">
          Trade Now
        </span>
      </div>
    </button>
  );
}
