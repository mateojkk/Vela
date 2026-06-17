import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { apiGet } from "../lib/api";
import type { MarketGroup } from "../../../shared/types";
import Layout from "../components/Layout";
import MarketCard from "../components/MarketCard";
import PredictionModal from "../components/PredictionModal";

interface MatchFixture {
  id: string;
  home_team: string;
  away_team: string;
  home_code: string;
  away_code: string;
  kickoff: string;
  status: string;
  group?: string;
  matchday?: number;
  markets: Array<{ id: string; question: string; yes_price: number; no_price: number; volume: number }>;
}

function formatKickoff(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days < 0) return "";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function Feed() {
  const { user } = useAuth();
  const [selectedMarket, setSelectedMarket] = useState<MarketGroup | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const key = "vela_last_resolve";
    const last = localStorage.getItem(key);
    if (last && Date.now() - Number(last) < 600_000) return;
    localStorage.setItem(key, String(Date.now()));
    fetch("/api/resolve", { method: "POST" }).catch(() => {});
  }, []);

  const { data: markets = [] } = useQuery<MarketGroup[]>({
    queryKey: ["markets"],
    queryFn: () => apiGet("/markets"),
  });

  const filteredMarkets = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return markets;
    return markets.filter((g) => {
      if (g.question.toLowerCase().includes(q)) return true;
      if (g.match?.home.toLowerCase().includes(q)) return true;
      if (g.match?.away.toLowerCase().includes(q)) return true;
      return g.markets.some((m) => m.question.toLowerCase().includes(q));
    });
  }, [markets, search]);

  // Split into match groups (with .match) and pure prediction markets
  const matchGroups = useMemo(
    () => filteredMarkets.filter((g) => !!g.match),
    [filteredMarkets]
  );
  const predictionGroups = useMemo(
    () => filteredMarkets.filter((g) => !g.match),
    [filteredMarkets]
  );

  const trending = filteredMarkets.slice(0, 10);

  // Build fixtures view from match groups
  const fixtures: MatchFixture[] = useMemo(
    () =>
      matchGroups
        .filter((g) => g.match)
        .slice(0, 12)
        .map((g) => ({
          id: g.id,
          home_team: g.match!.home,
          away_team: g.match!.away,
          home_code: g.match!.home.slice(0, 3).toUpperCase(),
          away_code: g.match!.away.slice(0, 3).toUpperCase(),
          kickoff: g.markets[0]?.game_start_time || g.end_date || "",
          status: "TIMED",
          group: undefined,
          matchday: undefined,
          markets: g.markets,
        })),
    [matchGroups]
  );

  return (
    <Layout showSearch searchValue={search} onSearchChange={setSearch}>
      {/* Trending Markets */}
      <section className="mb-6 md:mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Trending
          </h2>
          <span className="text-[10px] text-muted-foreground">
            {markets.length} markets
          </span>
        </div>

        {filteredMarkets.length === 0 && markets.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-8 text-center">
            <div className="mb-2 text-3xl">⚽</div>
            <h3 className="text-sm font-semibold text-foreground">No markets</h3>
          </div>
        ) : filteredMarkets.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No match.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-3">
            {trending.map((m) => (
              <MarketCard
                key={m.id}
                group={m}
                onClick={() => setSelectedMarket(m)}
              />
            ))}
          </div>
        )}
      </section>

      {/* World Cup Fixtures */}
      {fixtures.length > 0 && (
        <section className="mb-6 md:mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Fixtures
            </h2>
            <span className="text-[10px] text-muted-foreground">
              {fixtures.length} matches
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {fixtures.map((f) => (
              <button
                key={f.id}
                onClick={() => {
                  const group = matchGroups.find((g) => g.id === f.id);
                  if (group) setSelectedMarket(group);
                }}
                className="rounded-md border border-border bg-card p-3 text-left transition-colors hover:border-muted-foreground/40"
              >
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-bold tracking-wider text-primary">
                    UPCOMING
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {f.kickoff ? formatKickoff(f.kickoff) : "TBD"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1 text-right">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {f.home_team}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {f.home_code}
                    </div>
                  </div>
                  <div className="px-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    vs
                  </div>
                  <div className="min-w-0 flex-1 text-left">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {f.away_team}
                    </div>
                    <div className="font-mono text-[10px] text-muted-foreground">
                      {f.away_code}
                    </div>
                  </div>
                </div>
                {f.markets[0] && (
                  <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-[10px]">
                    <span className="text-muted-foreground">
                      {f.markets.length} market{f.markets.length !== 1 ? "s" : ""}
                    </span>
                    <span className="font-mono tabular-nums text-success">
                      {Math.round((f.markets[0]?.yes_price ?? 0) * 100)}¢
                    </span>
                  </div>
                )}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Pure prediction markets (e.g., "Will Brazil win the WC?") */}
      {predictionGroups.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Tournament Futures
            </h2>
            <span className="text-xs text-muted-foreground">View all</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {predictionGroups.slice(0, 8).map((m) => (
              <MarketCard
                key={m.id}
                group={m}
                onClick={() => setSelectedMarket(m)}
              />
            ))}
          </div>
        </section>
      )}

      {markets.length === 0 && (
        <div className="py-16 text-center">
          <div className="mb-3 text-5xl">⚽</div>
          <h3 className="mb-1 text-lg font-semibold text-foreground">
            Tournament starts soon
          </h3>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            Once matches kick off, you'll find prediction markets and live fixtures here.
          </p>
        </div>
      )}

      {selectedMarket && user && (
        <PredictionModal
          marketGroup={selectedMarket}
          user={user}
          onClose={() => setSelectedMarket(null)}
        />
      )}
    </Layout>
  );
}
