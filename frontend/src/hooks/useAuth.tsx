import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";
import { useCurrentAccount, useDisconnectWallet } from "@mysten/dapp-kit";
import { setCurrentWalletAddress } from "../lib/api";

export interface AuthUser {
  id: string; // Sui address
  email: string; // Sui address (used for backward-compatible API headers)
  username?: string;
  display_name?: string | null;
  avatar_url?: string | null;
  memwal_account_id?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signOut: () => void;
  refreshUser: () => Promise<void>;
  updateUser: (patch: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function normalizeAddress(address: string | undefined): string | null {
  if (!address) return null;
  const lower = address.toLowerCase().trim();
  return lower.startsWith("0x") ? lower : `0x${lower}`;
}

function profileKey(address: string) {
  return `vela_profile_${address}`;
}

async function loadProfile(
  address: string
): Promise<Omit<AuthUser, "id" | "email">> {
  const normalized = normalizeAddress(address);
  if (!normalized) return {};

  // Use a cached profile while the network request is in flight so reconnects
  // feel instant and survive short-lived network issues.
  const cached = localStorage.getItem(profileKey(normalized));
  let initial: Omit<AuthUser, "id" | "email"> | null = null;
  if (cached) {
    try {
      initial = JSON.parse(cached);
    } catch {
      // ignore corrupt cache
    }
  }

  try {
    const res = await fetch(
      `/api/profile?email=${encodeURIComponent(normalized)}`,
      {
        headers: {
          "X-Sui-Address": normalized,
          "X-User-Email": normalized,
        },
      }
    );
    if (res.ok) {
      const data = await res.json();
      const u = data.user;
      const profile = {
        username: u?.username ?? undefined,
        display_name: u?.display_name ?? null,
        avatar_url: u?.avatar_url ?? null,
        memwal_account_id: u?.memwal_account_id ?? null,
      };
      localStorage.setItem(profileKey(normalized), JSON.stringify(profile));
      return profile;
    }
  } catch {
    // fall through to cached/empty profile
  }
  return initial ?? {};
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const account = useCurrentAccount();
  const address = normalizeAddress(account?.address) ?? undefined;
  const { mutate: disconnect } = useDisconnectWallet();

  const [enrichedUser, setEnrichedUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    setCurrentWalletAddress(address ?? null);
    if (!address) return;

    let cancelled = false;
    loadProfile(address).then((profile) => {
      if (cancelled) return;
      setEnrichedUser({ id: address, email: address, ...profile });
    });

    return () => {
      cancelled = true;
    };
  }, [address]);

  const user = useMemo(() => {
    if (!address) return null;
    return enrichedUser?.id === address
      ? enrichedUser
      : { id: address, email: address };
  }, [address, enrichedUser]);

  const loading = useMemo(
    () => !!address && enrichedUser?.id !== address,
    [address, enrichedUser]
  );

  const signOut = useCallback(() => {
    disconnect();
    setCurrentWalletAddress(null);
    setEnrichedUser(null);
  }, [disconnect]);

  const refreshUser = useCallback(async () => {
    if (!address) return;
    const profile = await loadProfile(address);
    setEnrichedUser({ id: address, email: address, ...profile });
  }, [address]);

  const updateUser = useCallback((patch: Partial<AuthUser>) => {
    setEnrichedUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signOut,
        refreshUser,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
