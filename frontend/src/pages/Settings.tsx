import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import Layout from "../components/Layout";
import EditProfileModal from "../components/EditProfileModal";
import { useAuth } from "../hooks/useAuth";
import { useMemWal } from "../hooks/useMemWal";
import { apiGet, apiPatch } from "../lib/api";

interface ProfileData {
  user: {
    username: string;
    display_name?: string | null;
    avatar_url?: string | null;
    memory_public?: boolean;
    memwal_account_id?: string | null;
  };
  record: { accuracy_pct: number; total_predictions: number; correct: number; rank: number };
}

export default function Settings() {
  const { user, signOut, refreshUser } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { delegate } = useMemWalPrivate();
  const [editing, setEditing] = useState(false);
  const [memoryPublic, setMemoryPublic] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState("");
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function loadProfile() {
    if (!user?.username || loaded) return;
    try {
      const data = await apiGet<ProfileData>(`/profile?username=${user.username}`);
      setMemoryPublic(!!data.user?.memory_public);
      setShareUrl(`${window.location.origin}/memory/${user.username}`);
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }
  loadProfile();

  async function toggleMemoryPublic(next: boolean) {
    if (!user?.email) return;
    setToggling(true);
    setToggleError("");
    const prev = memoryPublic;
    setMemoryPublic(next);
    try {
      const patch: Record<string, unknown> = {
        email: user.email,
        memory_public: next,
      };
      if (next && delegate?.privateKey) {
        patch.memory_share_key = delegate.privateKey;
      }
      await apiPatch("/profile", patch);
      await refreshUser();
      queryClient.invalidateQueries({ queryKey: ["profile", user.username] });
      if (next && user.username) {
        setShareUrl(`${window.location.origin}/memory/${user.username}`);
      }
    } catch (err) {
      setMemoryPublic(prev);
      setToggleError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setToggling(false);
    }
  }

  function copyShareUrl() {
    try {
      navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  }

  if (!user) {
    return (
      <Layout>
        <div className="py-20 text-center text-sm text-muted-foreground">
          Sign in to view settings.
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-xl font-bold text-foreground md:text-2xl">Settings</h1>

        {/* Profile section */}
        <section className="mb-6 rounded-md border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Profile</h2>
            <button
              onClick={() => setEditing(true)}
              className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:border-muted-foreground/40 hover:bg-accent"
            >
              Edit
            </button>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-border bg-background text-xl">
              {user.avatar_url ? (
                user.avatar_url.startsWith("emoji:") ? (
                  <span>{user.avatar_url.slice(6)}</span>
                ) : (
                  <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
                )
              ) : (
                <span className="font-semibold text-muted-foreground">
                  {user.username?.[0]?.toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">
                {user.display_name || `@${user.username}`}
              </div>
              {user.display_name && (
                <div className="truncate text-xs text-muted-foreground">@{user.username}</div>
              )}
            </div>
          </div>
        </section>

        {/* Memory visibility section */}
        <section className="mb-6 rounded-md border border-border bg-card p-5">
          <h2 className="mb-1 text-sm font-semibold text-foreground">Memory visibility</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Make your Walrus memory map public so others can see what Vela has learned about you
            over time. Your private delegate key is shared to enable read access.
          </p>

          <div className="flex items-center justify-between rounded-md border border-border bg-background p-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">
                {memoryPublic ? "Public" : "Private"}
              </div>
              <div className="text-[10px] text-muted-foreground">
                {memoryPublic
                  ? "Anyone with your link can view your memory map"
                  : "Only you can view your memory map"}
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={memoryPublic}
              disabled={toggling}
              onClick={() => toggleMemoryPublic(!memoryPublic)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
                memoryPublic ? "bg-primary" : "bg-border"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                  memoryPublic ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {toggleError && (
            <p className="mt-2 text-xs text-danger">{toggleError}</p>
          )}

          {memoryPublic && shareUrl && (
            <div className="mt-3">
              <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Share link
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-xs text-foreground focus:outline-none"
                />
                <button
                  onClick={copyShareUrl}
                  className="shrink-0 rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* Account section */}
        <section className="mb-6 rounded-md border border-border bg-card p-5">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Account</h2>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>Wallet</span>
              <span className="font-mono text-foreground">
                {user.email ? `${user.email.slice(0, 6)}…${user.email.slice(-4)}` : "—"}
              </span>
            </div>
            {user.memwal_account_id && (
              <div className="flex justify-between">
                <span>MemWal account</span>
                <span className="font-mono text-foreground">
                  {user.memwal_account_id.slice(0, 6)}…{user.memwal_account_id.slice(-4)}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* Danger zone */}
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
      </div>

      {editing && user.email && (
        <EditProfileModal
          currentDisplayName={user.display_name}
          currentAvatarUrl={user.avatar_url}
          username={user.username || ""}
          email={user.email}
          onClose={() => setEditing(false)}
          onSaved={(updates) => {
            queryClient.invalidateQueries({ queryKey: ["profile", user.username] });
            window.dispatchEvent(new CustomEvent("vela:user-updated", { detail: updates }));
          }}
        />
      )}
    </Layout>
  );
}

function useMemWalPrivate() {
  const { delegateAddress } = useMemWal();
  let delegate: { privateKey: string } | null = null;
  try {
    if (delegateAddress) {
      const raw = localStorage.getItem(`vela_memwal_delegate_${delegateAddress}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        delegate = { privateKey: parsed.privateKey };
      }
    }
  } catch {
    // no delegate key in localStorage
  }
  return { delegate };
}
