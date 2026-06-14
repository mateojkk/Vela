import { useState, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../hooks/useAuth";
import { apiGet } from "../lib/api";
import type { MarketGroup } from "../../../shared/types";
import Layout from "../components/Layout";
import MarketCard from "../components/MarketCard";
import PredictionModal from "../components/PredictionModal";

interface BriefData {
  date: string;
  matches: Array<{ id: string; home: string; away: string; kickoff: string; status: string }>;
  vela_takes: Array<{ match: string; take: string }>;
  total_predictions: number;
  accuracy: number;
  rank: number;
}

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

  const { data: markets = [] } = useQuery<MarketGroup[]>({
    queryKey: ["markets"],
    queryFn: () => apiGet("/markets"),
  });

  const [brief, setBrief] = useState<BriefData | null>(null);
  useEffect(() => {
    if (!user?.email) return;
    let cancelled = false;
    apiGet<BriefData>(`/brief?email=${encodeURIComponent(user.email)}`)
      .then((data) => {
        if (!cancelled) setBrief(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user?.email]);

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
      {/* Vela's Take */}
      {brief && (brief.vela_takes.length > 0 || brief.matches.length > 0) && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <img
              src="/vela.jpg"
              className="h-5 w-5 rounded-md object-cover"
              alt="Vela"
            />
            <h2 className="text-xs font-bold uppercase tracking-widest text-primary">
              Vela's Take
            </h2>
            <span className="text-xs text-muted-foreground">{brief.date}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="rounded-md border border-border bg-card p-5">
            {brief.total_predictions > 0 && (
              <div className="mb-3 flex items-center gap-2 text-xs">
                <span className="rounded border border-border px-2 py-0.5 font-mono tabular-nums text-muted-foreground">
                  {brief.accuracy}% acc
                </span>
                <span className="rounded border border-border px-2 py-0.5 font-mono tabular-nums text-muted-foreground">
                  Rank #{brief.rank}
                </span>
                <span className="text-muted-foreground">
                  · {brief.total_predictions} predictions
                </span>
              </div>
            )}
            {brief.vela_takes.length > 0 ? (
              <div className="space-y-2">
                {brief.vela_takes.slice(0, 3).map((t, i) => (
                  <div key={i} className="flex gap-2 text-sm">
                    <span className="shrink-0 text-primary">"</span>
                    <p className="italic leading-relaxed text-foreground">{t.take}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {brief.matches.length} matches today. Chat with Vela to get takes.
              </p>
            )}
            <Link
              to="/"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:opacity-80"
            >
              Ask Vela for more
              <svg
                className="h-3 w-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </section>
      )}

      {/* Trending Markets */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Trending Markets
          </h2>
          <span className="text-xs text-muted-foreground">
            {markets.length > 0 ? (
              <>
                View all{" "}
                <span className="tabular-nums text-foreground">
                  {markets.length}
                </span>
              </>
            ) : (
              "View all"
            )}
          </span>
        </div>

        {filteredMarkets.length === 0 && markets.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-10 text-center">
            <div className="mb-2 text-3xl">⚽</div>
            <h3 className="mb-1 text-sm font-semibold text-foreground">
              No markets yet
            </h3>
            <p className="text-xs text-muted-foreground">
              World Cup prediction markets will appear here when available.
            </p>
          </div>
        ) : filteredMarkets.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-8 text-center text-sm text-muted-foreground">
            No markets match "{search}".
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
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
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              World Cup Fixtures
            </h2>
            <span className="text-xs text-muted-foreground">
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
