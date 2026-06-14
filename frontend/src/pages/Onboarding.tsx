import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { apiPost, ApiError } from "../lib/api";

const PRESET_AVATARS = [
  "⚽", "🏆", "🦅", "🐺", "🦁", "🐉",
  "🔥", "⚡", "💎", "🚀", "👑", "🌟",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export default function Onboarding() {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatar, setAvatar] = useState<string>("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (username.length < 3 || username.length > 20) {
      setError("Username must be 3-20 characters");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      setError("Only letters, numbers, and underscores");
      return;
    }
    if (!displayName.trim() || displayName.trim().length > 40) {
      setError("Display name is required (max 40 characters)");
      return;
    }

    setLoading(true);
    setError("");
    try {
      await apiPost("/profile", {
        email: user?.email,
        username,
        display_name: displayName.trim(),
        avatar_url: avatar || null,
      });
      await refreshUser();
      navigate("/");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setError("That username is taken. Try another one.");
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Couldn't save your profile. Try again.");
      }
      setLoading(false);
    }
  }

  const suggestedNames = [
    `The ${pickRandom(["Goat", "Gaffer", "Skipper", "Number 9"])}`,
    `${username || "Boss"} of the Touchline`,
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-8 font-mono">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <img
            src="/vela.jpg"
            className="mx-auto mb-4 h-16 w-16 rounded-md object-cover"
            alt="Vela"
          />
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-foreground">vela</h1>
          <p className="text-sm text-muted-foreground">
            Set up your profile. Vela will remember it.
          </p>
        </div>

        <div className="rounded-md border border-border bg-card p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Avatar picker */}
            <div>
              <label className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Pick an avatar
              </label>
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-background text-2xl">
                  {avatar ? (
                    avatar.startsWith("emoji:") ? (
                      <span>{avatar.slice(6)}</span>
                    ) : (
                      <img
                        src={avatar}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    )
                  ) : (
                    <span className="text-sm font-semibold text-muted-foreground">?</span>
                  )}
                </div>
                {avatar && (
                  <button
                    type="button"
                    onClick={() => setAvatar("")}
                    className="text-xs text-muted-foreground hover:text-danger"
                  >
                    Clear
                  </button>
                )}
              </div>
              <div className="grid grid-cols-6 gap-2">
                {PRESET_AVATARS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setAvatar(`emoji:${e}`)}
                    className={`flex h-10 items-center justify-center rounded-md border text-xl transition-colors ${
                      avatar === `emoji:${e}`
                        ? "border-primary bg-accent"
                        : "border-border bg-background hover:bg-accent"
                    }`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>

            {/* Username */}
            <div>
              <label
                htmlFor="username"
                className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
              >
                Username <span className="text-danger">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground">
                  @
                </span>
                <input
                  id="username"
                  name="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  placeholder="yourname"
                  required
                  autoFocus
                  autoComplete="username"
                  className="h-11 w-full rounded-md border border-border bg-background pl-8 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-muted-foreground focus:outline-none"
                />
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                3-20 characters. Letters, numbers, and underscores only. Used in your profile URL.
              </p>
            </div>

            {/* Display name */}
            <div>
              <label
                htmlFor="display_name"
                className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground"
              >
                Display name <span className="text-danger">*</span>
              </label>
              <input
                id="display_name"
                name="display_name"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Vela will call you this"
                maxLength={40}
                required
                className="h-11 w-full rounded-md border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-muted-foreground focus:outline-none"
              />
              {username && (
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {suggestedNames.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setDisplayName(s)}
                      className="rounded-full border border-border bg-background px-2.5 py-0.5 text-[10px] text-muted-foreground hover:border-muted-foreground/40 hover:text-foreground"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading || !username || !displayName.trim()}
              className="w-full rounded-md border border-muted-foreground/40 bg-foreground py-3 font-semibold text-background hover:bg-foreground/90 disabled:opacity-50"
            >
              {loading ? "Setting up..." : "Meet Vela"}
            </button>

            <p className="text-center text-[10px] text-muted-foreground">
              You can change all of this later from your profile.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
