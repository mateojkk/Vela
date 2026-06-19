import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "../lib/api";
import Layout from "../components/Layout";
import Avatar from "../components/Avatar";
import EditProfileModal from "../components/EditProfileModal";
import ShareButton from "../components/ShareButton";
import ShareImageModal from "../components/ShareImageModal";
import { useAuth } from "../hooks/useAuth";

interface ProfileData {
  user: {
    id?: string;
    username: string;
    display_name?: string | null;
    avatar_url?: string | null;
    created_at: string;
  };
  record: { accuracy_pct: number; total_predictions: number; correct: number; rank: number };
  recent_predictions: Array<{
    id: string;
    type: string;
    user_pick: string;
    home_team: string | null;
    away_team: string | null;
    question: string | null;
    outcome: string | null;
    created_at: string;
  }>;
  recent_chats: Array<{
    message: string;
    reply: string;
  }>;
}

function outcomeColor(o: string | null): string {
  if (o === "correct") return "text-success";
  if (o === "incorrect") return "text-danger";
  return "text-muted-foreground";
}

function outcomeLabel(o: string | null): string {
  if (o === "correct") return "Hit";
  if (o === "incorrect") return "Miss";
  return "Pending";
}

export default function Profile() {
  const { username } = useParams<{ username: string }>();
  const { user: authUser, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkMessage, setCheckMessage] = useState("");
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetMessage, setResetMessage] = useState("");
  const [sharePrediction, setSharePrediction] = useState<ProfileData["recent_predictions"][0] | null>(null);

  const { data, isLoading } = useQuery<ProfileData>({
    queryKey: ["profile", username],
    queryFn: () => apiGet(`/profile?username=${username}`),
    enabled: !!username,
  });

  const isOwnProfile = authUser?.username === username;

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="text-sm text-muted-foreground">Loading…</div>
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <div className="py-20 text-center">
          <h1 className="mb-2 text-xl font-bold">Not found</h1>
          <Link to="/" className="text-sm text-primary hover:underline">
            Home
          </Link>
        </div>
      </Layout>
    );
  }

  const { user, record, recent_predictions, recent_chats } = data;

  async function handleReset() {
    if (!authUser?.email) return;
    setResetting(true);
    setResetMessage("");
    try {
      const res = await apiPost<{
        deleted: { chat_sessions: number; predictions: number };
        note: string;
      }>("/reset", { email: authUser.email, confirm: true });
      setResetMessage(
        `Cleared ${res.deleted.chat_sessions} chat(s) and ${res.deleted.predictions} prediction(s).`
      );
      setResetConfirm(false);
      queryClient.invalidateQueries({ queryKey: ["profile", username] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
      queryClient.invalidateQueries({ queryKey: ["chat"] });
    } catch (err) {
      setResetMessage(
        err instanceof Error ? err.message : "Reset failed"
      );
    } finally {
      setResetting(false);
    }
  }

  async function handleCheckResolutions() {
    setChecking(true);
    setCheckMessage("");
    try {
      const res = await apiPost<{ resolved: number; checked: number }>(
        "/resolve",
        {}
      );
      setCheckMessage(
        res.resolved > 0
          ? `Updated ${res.resolved} prediction${res.resolved === 1 ? "" : "s"}.`
          : "No new results yet — your open predictions haven't resolved."
      );
      queryClient.invalidateQueries({ queryKey: ["profile", username] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard"] });
    } catch (err) {
      setCheckMessage(
        err instanceof Error ? err.message : "Couldn't check for updates."
      );
    } finally {
      setChecking(false);
    }
  }

  return (
    <Layout>
      <section className="mb-6">
        <div className="mb-5 flex items-start gap-3 md:gap-4">
          <Avatar
            src={user.avatar_url}
            username={user.username}
            displayName={user.display_name}
            size="xl"
          />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold text-foreground md:text-2xl">
              {user.display_name || `@${user.username}`}
            </h1>
            {user.display_name && (
              <p className="text-xs text-muted-foreground md:text-sm">@{user.username}</p>
            )}
            {isOwnProfile && (
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={() => setEditing(true)}
                  className="rounded-md border border-border bg-background px-2.5 py-1 text-[10px] font-medium text-foreground hover:border-muted-foreground/40 hover:bg-accent md:px-3 md:text-xs"
                >
                  Edit
                </button>
                <button
                  onClick={handleCheckResolutions}
                  disabled={checking}
                  className="rounded-md border border-border bg-background px-2.5 py-1 text-[10px] font-medium text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground disabled:opacity-50 md:px-3 md:text-xs"
                  title="Refresh resolved predictions"
                >
                  {checking ? "…" : "Refresh"}
                </button>
                <button
                  onClick={() => setResetConfirm(true)}
                  className="rounded-md border border-border bg-background px-2.5 py-1 text-[10px] font-medium text-danger hover:border-danger/60 hover:bg-danger/10 md:px-3 md:text-xs"
                >
                  Reset
                </button>
              </div>
            )}
          </div>
          <ShareButton
            url={`${window.location.origin}/api/og?type=profile&username=${encodeURIComponent(user.username)}`}
            title={`@${user.username} on Vela`}
            text={`@${user.username} is making World Cup 2026 calls on Vela — ${record.correct}/${record.total_predictions} correct (${record.accuracy_pct.toFixed(1)}% accuracy).`}
          />
        </div>

        {isOwnProfile && checkMessage && (
          <p className="mb-4 rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
            {checkMessage}
          </p>
        )}

        <div className="grid grid-cols-3 gap-2 md:gap-3">
          <div className="rounded-md border border-border bg-card p-3 text-center md:p-4">
            <div className="text-lg font-bold tabular-nums text-foreground md:text-2xl">
              {record.accuracy_pct.toFixed(1)}%
            </div>
            <div className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground md:text-[10px]">
              Acc
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-3 text-center md:p-4">
            <div className="text-lg font-bold tabular-nums text-foreground md:text-2xl">
              #{record.rank || "—"}
            </div>
            <div className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground md:text-[10px]">
              Rank
            </div>
          </div>
          <div className="rounded-md border border-border bg-card p-3 text-center md:p-4">
            <div className="text-lg font-bold tabular-nums text-foreground md:text-2xl">
              {record.correct}/{record.total_predictions}
            </div>
            <div className="mt-1 text-[9px] uppercase tracking-wider text-muted-foreground md:text-[10px]">
              Rec
            </div>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Predictions
          </h2>
          {record.total_predictions > 0 && (
            <Link
              to={`/u/${user.username}/predictions`}
              className="text-[10px] font-semibold text-primary hover:opacity-80"
            >
              All {record.total_predictions} →
            </Link>
          )}
        </div>
        {recent_predictions.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-5 text-center text-xs text-muted-foreground">
            No predictions yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {recent_predictions.map((p) => {
              const isMatch = p.type === "match" && p.home_team && p.away_team;
              const context = isMatch
                ? `${p.home_team} vs ${p.away_team}`
                : p.question || (p.type === "match" ? "Match" : "Market");
              return (
                <div
                  key={p.id}
                  className="relative flex flex-col justify-between rounded-md border border-border bg-card p-4 transition-colors hover:border-muted-foreground/40"
                >
                  <div className="mb-3 flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                        {isMatch ? "Match Prediction" : "Market"}
                      </div>
                      <div className="truncate text-base font-semibold text-foreground">
                        {context}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSharePrediction(p);
                      }}
                      className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                      aria-label="Share"
                      title="Share"
                    >
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7" />
                        <polyline points="16 6 12 2 8 6" />
                        <line x1="12" y1="2" x2="12" y2="15" />
                      </svg>
                      Share
                    </button>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <span className="truncate rounded-md bg-accent px-2 py-1 text-xs font-medium text-foreground">
                      Pick: {p.user_pick}
                    </span>
                    <span
                      className={`text-xs font-bold uppercase tracking-widest ${outcomeColor(p.outcome)}`}
                    >
                      {outcomeLabel(p.outcome)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {recent_chats && recent_chats.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Chats
          </h2>
          <div className="space-y-2">
            {recent_chats.map((c, idx) => (
              <div
                key={idx}
                className="rounded-md border border-border bg-card p-3 hover:border-muted-foreground/40"
              >
                <p className="mb-1 truncate text-xs text-muted-foreground">{c.message}</p>
                <p className="truncate text-sm text-foreground">{c.reply}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {editing && isOwnProfile && authUser?.email && (
        <EditProfileModal
          currentDisplayName={user.display_name}
          currentAvatarUrl={user.avatar_url}
          username={user.username}
          email={authUser.email}
          onClose={() => setEditing(false)}
          onSaved={(updates) => {
            queryClient.invalidateQueries({ queryKey: ["profile", username] });
            // Also update auth user in-memory so the Layout reflects changes immediately
            window.dispatchEvent(new CustomEvent("vela:user-updated", { detail: updates }));
          }}
        />
      )}

      {isOwnProfile && (
        <section className="mt-10 border-t border-border pt-6">
          <button
            onClick={() => {
              signOut();
              navigate("/login");
            }}
            className="w-full rounded-md border border-danger/40 bg-danger/10 py-2.5 text-sm font-medium text-danger hover:bg-danger/20"
          >
            Sign out
          </button>
        </section>
      )}

      {resetConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setResetConfirm(false)}
        >
          <div
            className="w-full max-w-md rounded-t-md border border-border bg-card p-5 sm:rounded-md sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              Reset?
            </h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Deletes chats and predictions. Profile stays.
            </p>
            {resetMessage && (
              <p className="mb-3 rounded-md border border-border bg-background p-2 text-xs text-foreground">
                {resetMessage}
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setResetConfirm(false)}
                className="flex-1 rounded-md border border-border bg-background py-2.5 text-sm text-muted-foreground hover:border-muted-foreground/40"
                disabled={resetting}
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="flex-1 rounded-md border border-danger/40 bg-danger/10 py-2.5 text-sm font-medium text-danger hover:bg-danger/20 disabled:opacity-50"
              >
                {resetting ? "Resetting..." : "Yes, reset"}
              </button>
            </div>
          </div>
        </div>
      )}

      {sharePrediction && (
        <ShareImageModal
          prediction={sharePrediction}
          username={user.username}
          displayName={user.display_name}
          avatarUrl={user.avatar_url}
          onClose={() => setSharePrediction(null)}
        />
      )}
    </Layout>
  );
}
