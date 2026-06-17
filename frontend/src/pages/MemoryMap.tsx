import { useEffect, useState, useRef, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useMemWal } from "../hooks/useMemWal";
import Layout from "../components/Layout";

interface Memory {
  blob_id: string;
  text: string;
  distance: number;
  type: "prediction" | "miss" | "hit" | "opinion" | "rivalry" | "match" | "memory";
}

const PROBE_QUERIES = [
  "prediction match outcome correct miss",
  "team opinion take player performance",
  "rivalry debate argument hot take",
  "World Cup 2026 tournament matchday goals",
];

function classifyMemory(text: string): Memory["type"] {
  const t = text.toLowerCase();
  if (["wrong", "miss", "incorrect", "bad", "lost", "fail"].some((w) => t.includes(w))) return "miss";
  if (["correct", "right", "won", "nailed", "good call"].some((w) => t.includes(w))) return "hit";
  if (["predict", "pick", "chose", "bet", "call"].some((w) => t.includes(w))) return "prediction";
  if (["think", "believe", "opinion", "take", "feel", "reckon"].some((w) => t.includes(w))) return "opinion";
  if (["rival", "debate", "argue", "disagree"].some((w) => t.includes(w))) return "rivalry";
  if (["goal", "match", "game", "fixture", "played"].some((w) => t.includes(w))) return "match";
  return "memory";
}

interface MemoryGroup {
  type: Memory["type"];
  label: string;
  color: string;
  count: number;
}

const TYPE_CONFIG: Record<Memory["type"], { color: string; label: string; description: string }> = {
  prediction: { color: "#38bdf8", label: "Predictions", description: "Calls you locked in" },
  hit:        { color: "#3fe77e", label: "Hits",        description: "Calls you nailed" },
  miss:       { color: "#ff5c5c", label: "Misses",      description: "Calls you got wrong" },
  opinion:    { color: "#9a9cc4", label: "Opinions",    description: "Hot takes and beliefs" },
  rivalry:    { color: "#e0a878", label: "Rivalries",   description: "Debates and arguments" },
  match:      { color: "#3fe77e", label: "Matches",     description: "Games you discussed" },
  memory:     { color: "#a1a1aa", label: "Memories",    description: "Everything else" },
};

const POLL_MS = 30_000;
const GLOBE_SIZE = 380;
const GLOBE_R = GLOBE_SIZE / 2 - 20;
const NODES = 60;

interface GlobePoint {
  lat: number;
  lng: number;
  color: string;
  size: number;
  id: string;
  memory: Memory;
}

function countByType(memories: Memory[]) {
  const counts: Partial<Record<Memory["type"], number>> = {};
  for (const m of memories) {
    counts[m.type] = (counts[m.type] ?? 0) + 1;
  }
  return counts;
}

function typeBadge(type: Memory["type"]) {
  const cfg = TYPE_CONFIG[type];
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest"
      style={{ color: cfg.color, borderColor: `${cfg.color}40`, backgroundColor: `${cfg.color}10` }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cfg.color }} />
      {cfg.label.replace(/s$/, "")}
    </span>
  );
}

function project(lat: number, lng: number, rotY: number, cx: number, cy: number, r: number) {
  const phi = (lat * Math.PI) / 180;
  const theta = ((lng + rotY) * Math.PI) / 180;
  const x = r * Math.cos(phi) * Math.sin(theta);
  const y = -r * Math.sin(phi);
  const z = r * Math.cos(phi) * Math.cos(theta);
  return { x: cx + x, y: cy + y, z, front: z > -r * 0.15 };
}

function drawGlobeFrame(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  rotY: number,
  t: number
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;

  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = "#0d0d0d";
  ctx.fillRect(0, 0, w, h);

  // outer ring glow
  const gRadial = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r + 8);
  gRadial.addColorStop(0, "transparent");
  gRadial.addColorStop(0.5, "rgba(56,189,248,0.08)");
  gRadial.addColorStop(1, "transparent");
  ctx.fillStyle = gRadial;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
  ctx.fill();

  // globe body
  const gBody = ctx.createRadialGradient(cx - r * 0.25, cy - r * 0.3, 0, cx, cy, r);
  gBody.addColorStop(0, "rgba(38,38,38,0.95)");
  gBody.addColorStop(0.7, "#141414");
  gBody.addColorStop(1, "#0a0a0a");
  ctx.fillStyle = gBody;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // wireframe meridians
  for (let i = 0; i < 16; i++) {
    const lng = (i / 16) * 360;
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    let first = true;
    for (let j = 0; j <= 64; j++) {
      const lat = -90 + (j / 64) * 180;
      const p = project(lat, lng, rotY, cx, cy, r);
      if (first) { ctx.moveTo(p.x, p.y); first = false; }
      else { ctx.lineTo(p.x, p.y); }
    }
    ctx.stroke();
  }

  // wireframe parallels
  for (let i = 1; i < 8; i++) {
    const lat = -90 + (i / 8) * 180;
    ctx.strokeStyle = "rgba(255,255,255,0.04)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    let first = true;
    for (let j = 0; j <= 128; j++) {
      const lng = (j / 128) * 360;
      const p = project(lat, lng, rotY, cx, cy, r);
      if (first) { ctx.moveTo(p.x, p.y); first = false; }
      else { ctx.lineTo(p.x, p.y); }
    }
    ctx.stroke();
  }

  // equator highlight
  ctx.strokeStyle = "rgba(56,189,248,0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  let ef = true;
  for (let j = 0; j <= 256; j++) {
    const lng = (j / 256) * 360;
    const p = project(0, lng, rotY, cx, cy, r);
    if (ef) { ctx.moveTo(p.x, p.y); ef = false; }
    else { ctx.lineTo(p.x, p.y); }
  }
  ctx.stroke();

  // scanning line
  const scanY = cy + Math.sin(t * 2) * (r - 4);
  ctx.strokeStyle = "rgba(56,189,248,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - r + 12, scanY);
  ctx.lineTo(cx + r - 12, scanY);
  ctx.stroke();

  // edge ring
  ctx.strokeStyle = "rgba(56,189,248,0.25)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r + 1, 0, Math.PI * 2);
  ctx.stroke();
}

export default function MemoryMap() {
  const { username } = useParams<{ username?: string }>();
  const { user } = useAuth();
  const {
    memwal,
    authorized,
    loading: memwalLoading,
    error: memwalError,
    authorize,
    recall,
  } = useMemWal();
  const isOwner = !!user && (!username || user.username === username);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [memories, setMemories] = useState<Memory[]>([]);
  const [loading, setLoading] = useState(true);
  const [authChecking, setAuthChecking] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Memory["type"] | "all">("all");
  const [selectedMemory, setSelectedMemory] = useState<Memory | null>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const animRef = useRef<number>(0);
  const rotYRef = useRef(0);
  const mouseRef = useRef({ x: 0, y: 0, dragging: false });

  const globePoints = useMemo<GlobePoint[]>(() => {
    if (memories.length === 0) return [];
    const points: GlobePoint[] = [];
    const used = new Set<string>();
    for (const m of memories.slice(0, NODES)) {
      const hash = m.blob_id || m.text.slice(0, 8);
      let seed = 0;
      for (let i = 0; i < hash.length; i++) seed = (seed * 31 + hash.charCodeAt(i)) & 0xffffffff;
      const lat = ((seed % 180) - 90) + ((seed % 11) - 5);
      const lng = (((seed >> 8) % 360)) + (((seed >> 4) % 11) - 5);
      const id = `${lat.toFixed(1)},${lng.toFixed(1)}`;
      if (used.has(id)) continue;
      used.add(id);
      points.push({
        lat: Math.max(-85, Math.min(85, lat)),
        lng,
        color: TYPE_CONFIG[m.type].color,
        size: 2 + m.distance * 3,
        id: m.blob_id,
        memory: m,
      });
    }
    return points;
  }, [memories]);

  useEffect(() => {
    if (!isOwner || !memwal) return;
    let cancelled = false;

    const load = () => {
      setLoading(true);
      Promise.all(
        PROBE_QUERIES.map((q) =>
          recall(q, { limit: 20 })
            .then((r) => r.results)
            .catch(() => [])
        )
      )
        .then((batches) => {
          if (cancelled) return;
          const seen = new Set<string>();
          const fresh: Memory[] = [];
          let added = 0;
          for (const batch of batches) {
            for (const m of batch) {
              if (seen.has(m.blob_id)) continue;
              seen.add(m.blob_id);
              if (seenIds.current.has(m.blob_id)) continue;
              seenIds.current.add(m.blob_id);
              fresh.push({
                blob_id: m.blob_id,
                text: m.text,
                distance: m.distance,
                type: classifyMemory(m.text),
              });
              added++;
            }
          }
          if (added > 0) {
            setMemories((prev) => [...fresh, ...prev].slice(0, 200));
            setPulse(true);
            setTimeout(() => setPulse(false), 1200);
          }
          setLastRefresh(new Date());
        })
        .catch(() => {
          // ignore
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };

    load();
    const id = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isOwner, memwal, recall]);

  // Globe animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = GLOBE_SIZE * dpr;
    canvas.height = GLOBE_SIZE * dpr;
    canvas.style.width = `${GLOBE_SIZE}px`;
    canvas.style.height = `${GLOBE_SIZE}px`;
    ctx.scale(dpr, dpr);
    const cx = GLOBE_SIZE / 2;
    const cy = GLOBE_SIZE / 2;

    const animate = () => {
      const t = performance.now() / 1000;
      const autoSpeed = mouseRef.current.dragging ? 0 : 0.15;
      rotYRef.current = t * 12 + autoSpeed;

      drawGlobeFrame(ctx, cx, cy, GLOBE_R, rotYRef.current, t);

      // Draw memory points
      const sorted = [...globePoints].sort((a, b) => {
        const pa = project(a.lat, a.lng, rotYRef.current, cx, cy, GLOBE_R);
        const pb = project(b.lat, b.lng, rotYRef.current, cx, cy, GLOBE_R);
        return pb.z - pa.z;
      });

      for (const pt of sorted) {
        const p = project(pt.lat, pt.lng, rotYRef.current, cx, cy, GLOBE_R);
        if (!p.front) continue;

        const pulseR = pt.size + Math.sin(t * 4 + pt.lat * 0.1) * 0.8;
        const alpha = Math.max(0.3, 1 - (p.z / GLOBE_R) * 0.7);

        // glow
        const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, pulseR * 3);
        glow.addColorStop(0, `${pt.color}${Math.round(alpha * 60).toString(16).padStart(2, "0")}`);
        glow.addColorStop(1, "transparent");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pulseR * 3, 0, Math.PI * 2);
        ctx.fill();

        // core
        ctx.fillStyle = `${pt.color}${Math.round(alpha * 220).toString(16).padStart(2, "0")}`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pulseR, 0, Math.PI * 2);
        ctx.fill();

        // inner bright
        ctx.fillStyle = `rgba(255,255,255,${alpha * 0.6})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pulseR * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }

      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [globePoints]);

  const filtered = memories.filter((m) => {
    if (filter !== "all" && m.type !== filter) return false;
    if (search && !m.text.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const counts = countByType(memories);
  const totalSeen = memories.length;
  const intelligenceScore = Math.min(100, Math.round(totalSeen * 1.6));

  const typeStats: MemoryGroup[] = (Object.keys(TYPE_CONFIG) as Memory["type"][])
    .map((t) => ({ type: t, label: TYPE_CONFIG[t].label, color: TYPE_CONFIG[t].color, count: counts[t] ?? 0 }))
    .filter((g) => g.count > 0)
    .sort((a, b) => b.count - a.count);

  const toggleFilter = (t: Memory["type"] | "all") => {
    setFilter(t);
    setSelectedMemory(null);
  };

  if (!isOwner) {
    return (
      <Layout>
        <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-md border border-border bg-card p-10 text-center">
          <div className="mb-4 text-4xl">🔒</div>
          <h2 className="mb-2 text-lg font-semibold text-foreground">Private memory</h2>
          <p className="text-sm text-muted-foreground">
            This memory map belongs to @{username}.
          </p>
        </div>
      </Layout>
    );
  }

  if (!authorized) {
    return (
      <Layout>
        <div className="mx-auto flex max-w-md flex-col items-center justify-center rounded-md border border-border bg-card p-10 text-center">
          <div className="mb-4 text-4xl">🦭</div>
          <h2 className="mb-2 text-lg font-semibold text-foreground">Authorize memory</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Authorize a one-time delegate key to view your memory map.
          </p>
          {memwalError && (
            <p className="mb-4 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
              {memwalError}
            </p>
          )}
          <button
            onClick={async () => {
              setAuthChecking(true);
              try {
                await authorize();
              } finally {
                setAuthChecking(false);
              }
            }}
            disabled={authChecking || memwalLoading}
            className="w-full rounded-md border border-muted-foreground/40 bg-foreground py-3 font-semibold text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {authChecking || memwalLoading ? "Authorizing…" : "Authorize"}
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-5xl">
        {/* Stats row */}
        <div className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded border border-border bg-card/80 p-3 text-center">
            <div className="font-mono text-xl font-bold tabular-nums text-foreground">{totalSeen}</div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Memories</div>
          </div>
          <div className="rounded border border-border bg-card/80 p-3 text-center">
            <div className="font-mono text-xl font-bold tabular-nums text-primary">{intelligenceScore}</div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Vela IQ</div>
          </div>
          <div className="rounded border border-border bg-card/80 p-3 text-center">
            <div className="font-mono text-xl font-bold tabular-nums text-success">{counts.hit ?? 0}</div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Hits</div>
          </div>
          <div className="rounded border border-border bg-card/80 p-3 text-center">
            <div className="font-mono text-xl font-bold tabular-nums text-danger">{counts.miss ?? 0}</div>
            <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Misses</div>
          </div>
        </div>

        {/* IQ bar */}
        <div className="mb-6 flex items-center gap-2 font-mono text-[9px] text-muted-foreground">
          <span className="shrink-0 text-primary">IQ</span>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-border">
            <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${intelligenceScore}%` }} />
          </div>
          <span className="shrink-0 font-mono tabular-nums">{intelligenceScore}</span>
        </div>

        {/* Globe + Details layout */}
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Globe */}
          <div className="shrink-0">
            <div className="relative mx-auto w-fit">
              {/* Status bar */}
              <div className={`mb-2 flex items-center justify-between font-mono text-[9px] tracking-widest ${pulse ? "text-success" : "text-muted-foreground"}`}>
                <span className="flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${pulse ? "animate-pulse bg-success" : "bg-muted-foreground"}`} />
                  {pulse ? "NEW MEMORY" : lastRefresh ? "SYNCED" : "CONNECTING"}
                </span>
                <span className="tabular-nums">
                  {globePoints.length}/{totalSeen} mapped
                </span>
              </div>

              {/* Canvas globe */}
              <canvas
                ref={canvasRef}
                className="rounded-full"
                style={{ cursor: "grab" }}
                onMouseDown={(e) => {
                  mouseRef.current = { x: e.clientX, y: e.clientY, dragging: true };
                }}
                onMouseMove={(e) => {
                  if (!mouseRef.current.dragging) return;
                  const dx = e.clientX - mouseRef.current.x;
                  rotYRef.current += dx * 0.3;
                  mouseRef.current.x = e.clientX;
                  mouseRef.current.y = e.clientY;
                }}
                onMouseUp={() => { mouseRef.current.dragging = false; }}
                onMouseLeave={() => { mouseRef.current.dragging = false; }}
              />
            </div>
          </div>

          {/* Right sidebar */}
          <div className="min-w-0 flex-1">
            {/* Filter bar */}
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => toggleFilter("all")}
                className={`rounded border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                  filter === "all" ? "border-primary/50 bg-accent text-foreground" : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                }`}
              >
                ALL <span className="ml-1 tabular-nums">{totalSeen}</span>
              </button>
              {typeStats.map((g) => (
                <button
                  key={g.type}
                  onClick={() => toggleFilter(g.type)}
                  className={`flex items-center gap-1 rounded border px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                    filter === g.type ? "bg-accent text-foreground" : "border-border bg-card text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                  }`}
                  style={filter === g.type ? { borderColor: `${g.color}80` } : undefined}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: g.color }} />
                  {g.label.slice(0, 4)}
                  <span className="tabular-nums">{g.count}</span>
                </button>
              ))}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="> search"
                className="ml-auto h-8 w-40 rounded border border-border bg-card px-2.5 font-mono text-[10px] text-foreground placeholder:text-muted-foreground focus:border-muted-foreground focus:outline-none"
              />
            </div>

            {/* Memory list */}
            {loading && memories.length === 0 ? (
              <div className="flex items-center justify-center rounded border border-border bg-card p-12">
                <div className="text-center font-mono text-xs text-muted-foreground">
                  <div className="mx-auto mb-3 h-10 w-10 rounded-full border-2 border-border border-t-primary animate-spin" />
                  <p>INITIALIZING WALRUS LINK...</p>
                </div>
              </div>
            ) : memories.length === 0 ? (
              <div className="flex items-center justify-center rounded border border-border bg-card p-12">
                <div className="text-center font-mono">
                  <pre className="mb-3 text-[10px] leading-tight text-muted-foreground">{`
    .- - - - -.
   |  o     o  |
   |     ^     |
   |   \\___/   |
    \\_________/
`}</pre>
                  <p className="text-xs text-muted-foreground">
                    No memories yet. Chat with Vela to begin.
                  </p>
                </div>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex items-center justify-center rounded border border-border bg-card p-10">
                <p className="font-mono text-xs text-muted-foreground">NO MATCHES FOR FILTER</p>
              </div>
            ) : (
              <div className="thin-scrollbar max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
                {filtered.map((m) => (
                  <button
                    key={m.blob_id}
                    onClick={() => setSelectedMemory(selectedMemory?.blob_id === m.blob_id ? null : m)}
                    className={`w-full rounded border p-3 text-left transition-colors ${
                      selectedMemory?.blob_id === m.blob_id
                        ? "border-primary/40 bg-accent"
                        : "border-border bg-card/80 hover:border-muted-foreground/30"
                    }`}
                  >
                    <div className="mb-1 flex items-center justify-between">
                      {typeBadge(m.type)}
                      <span className="font-mono text-[9px] tabular-nums text-muted-foreground">
                        {((1 - m.distance) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className={`font-mono text-[11px] leading-relaxed ${
                      selectedMemory?.blob_id === m.blob_id ? "text-foreground" : "text-muted-foreground"
                    }`}>
                      {selectedMemory?.blob_id === m.blob_id ? m.text : `${m.text.slice(0, 120)}${m.text.length > 120 ? "..." : ""}`}
                    </p>
                    {selectedMemory?.blob_id === m.blob_id && (
                      <div className="mt-2 border-t border-border pt-2">
                        <div className="font-mono text-[9px] text-muted-foreground">
                          <span className="text-primary">blob_id:</span> {m.blob_id.slice(0, 16)}...
                          <span className="ml-3 text-primary">distance:</span> {m.distance.toFixed(4)}
                          <span className="ml-3 text-primary">match:</span> {((1 - m.distance) * 100).toFixed(0)}%
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {lastRefresh && memories.length > 0 && (
              <p className="mt-2 text-right font-mono text-[9px] tabular-nums text-muted-foreground">
                last sync: {lastRefresh.toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
