import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { completeZkLogin } from "../lib/zklogin";
import { useAuth } from "../hooks/useAuth";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { onZkLoginComplete } = useAuth();
  const [status, setStatus] = useState("Extracting credential...");
  const [error, setError] = useState<string | null>(null);
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    async function handleCallback() {
      try {
        const hash = window.location.hash;
        if (!hash) {
          throw new Error("Sign-in didn't complete. Please try again.");
        }

        const params = new URLSearchParams(hash.slice(1));
        const idToken = params.get("id_token");
        if (!idToken) {
          throw new Error(
            "Google didn't return a sign-in token. Please try again."
          );
        }

        setStatus("Generating zero-knowledge proof...");
        const session = await completeZkLogin(idToken);

        setStatus("Syncing profile identity...");
        await onZkLoginComplete(session);

        const profileRes = await fetch(
          `/api/profile?email=${encodeURIComponent(session.email)}`,
          {
            headers: {
              "X-Sui-Address": session.address,
              "X-User-Email": session.email,
            },
          }
        );

        if (profileRes.ok) {
          const profileData = await profileRes.json();
          if (profileData.user?.username) {
            navigate("/");
          } else {
            navigate("/onboarding");
          }
        } else {
          navigate("/onboarding");
        }
      } catch (err: unknown) {
        console.error("zkLogin callback error:", err);
        const message = err instanceof Error ? err.message : "Failed to complete zkLogin authentication.";
        setError(message);
      }
    }

    handleCallback();
  }, [navigate, onZkLoginComplete]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4 font-mono">
        <div className="w-full max-w-md rounded-md border border-border bg-card p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-danger/10 text-2xl font-bold text-danger">
            ⚠️
          </div>
          <h2 className="mb-2 text-lg font-semibold text-foreground">Login Failed</h2>
          <p className="mb-6 text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => navigate("/login")}
            className="w-full cursor-pointer rounded-md border border-border bg-background py-3 font-medium text-foreground hover:bg-accent"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background font-mono">
      <div className="text-center">
        <img
          src="/vela.jpg"
          className="mx-auto mb-6 h-16 w-16 animate-pulse rounded-md object-cover"
          alt="Vela"
        />
        <h2 className="mb-2 text-lg font-semibold text-foreground">Sui zkLogin</h2>
        <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          {status}
        </div>
      </div>
    </div>
  );
}
