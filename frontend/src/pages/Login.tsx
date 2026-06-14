import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

export default function Login() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { user, signInWithGoogle } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      if (!user.username) {
        navigate("/onboarding");
      } else {
        navigate("/");
      }
    }
  }, [user, navigate]);

  async function handleGoogle() {
    setError("");
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Google sign-in failed. Try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 font-mono">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <img
            src="/vela.jpg"
            className="mx-auto mb-4 h-16 w-16 rounded-md object-cover"
            alt="Vela"
          />
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-foreground">vela</h1>
          <p className="text-sm text-muted-foreground">
            I'm Vela. I watch every match, remember every take, and never forget a bad call.
          </p>
        </div>

        <div className="rounded-md border border-border bg-card p-8">
          <h2 className="mb-6 text-center text-lg font-semibold text-foreground">
            Sign in
          </h2>

          {error && (
            <p className="mb-4 text-center text-sm text-danger">{error}</p>
          )}

          <button
            type="button"
            onClick={handleGoogle}
            disabled={loading}
            className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-md border border-border bg-background py-3 font-medium text-foreground transition-colors hover:bg-accent disabled:opacity-50"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Continue with Google
          </button>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Powered by Sui zkLogin. Zero-knowledge, self-custodial onboarding.
          </p>
        </div>
      </div>
    </div>
  );
}
