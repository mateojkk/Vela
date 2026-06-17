import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { ConnectButton } from "@mysten/dapp-kit";

function VelaLogo({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={`flex items-center justify-center rounded-md bg-gradient-to-br from-walrus-purple to-walrus-cyan font-bold text-walrus-deep ${className}`}
      >
        V
      </div>
    );
  }
  return (
    <img
      src="/vela.jpg"
      className={className}
      alt="Vela"
      onError={() => setFailed(true)}
    />
  );
}

export default function Login() {
  const { user } = useAuth();
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <VelaLogo className="mx-auto mb-4 h-16 w-16 rounded-md object-cover" />
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-foreground">vela</h1>
          <p className="text-sm text-muted-foreground">
            Your AI football rival for the 2026 World Cup. Powered by Walrus Memory on Sui.
          </p>
        </div>

        <div className="rounded-md border border-border bg-card p-8">
          <h2 className="mb-6 text-center text-lg font-semibold text-foreground">
            Connect Wallet
          </h2>

          <div className="flex justify-center">
            <ConnectButton
              connectText="Connect Sui Wallet"
              className="!rounded-md !border !border-border !bg-background !px-6 !py-3 !font-mono !font-medium !text-foreground !transition-colors hover:!bg-accent"
            />
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Connect any Sui wallet to predict, chat, and store memories on Walrus Mainnet.
          </p>
        </div>
      </div>
    </div>
  );
}
