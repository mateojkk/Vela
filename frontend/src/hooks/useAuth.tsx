import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import {
  getZkLoginSession,
  clearZkLogin,
  initZkLogin,
  type ZkLoginSession,
} from "../lib/zklogin";

export interface AuthUser {
  id: string;       // Sui address
  email: string;
  username?: string;
  display_name?: string | null;
  avatar_url?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => void;
  refreshUser: () => Promise<void>;
  updateUser: (patch: Partial<AuthUser>) => void;
  onZkLoginComplete: (session: ZkLoginSession) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const session = getZkLoginSession();
    if (session) {
      return {
        id: session.address,
        email: session.email,
        username: session.username,
      };
    }
    return null;
  });

  const [loading, setLoading] = useState(() => {
    const session = getZkLoginSession();
    return Boolean(session && !session.username);
  });

  const fetchUser = useCallback(async (session: ZkLoginSession) => {
    try {
      const res = await fetch(
        `/api/profile?email=${encodeURIComponent(session.email)}`,
        {
          headers: {
            "X-Sui-Address": session.address,
            "X-User-Email": session.email,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        const u = data.user;
        setUser({
          id: session.address,
          email: session.email,
          username: u?.username ?? session.username,
          display_name: u?.display_name ?? null,
          avatar_url: u?.avatar_url ?? null,
        });

        if (u?.username) {
          const updatedSession: ZkLoginSession = { ...session, username: u.username };
          sessionStorage.setItem("vela_zklogin", JSON.stringify(updatedSession));
        }
      } else {
        setUser({ id: session.address, email: session.email, username: session.username });
      }
    } catch {
      setUser({ id: session.address, email: session.email, username: session.username });
    } finally {
      setLoading(false);
    }
  }, []);

  const checkSession = useCallback(async () => {
    const session = getZkLoginSession();
    if (!session) {
      setLoading(false);
      return;
    }
    await fetchUser(session);
  }, [fetchUser]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    checkSession();
  }, [checkSession]);

  const onZkLoginComplete = useCallback(
    async (session: ZkLoginSession) => {
      await fetchUser(session);
    },
    [fetchUser]
  );

  const refreshUser = useCallback(async () => {
    const session = getZkLoginSession();
    if (session) await fetchUser(session);
  }, [fetchUser]);

  const updateUser = useCallback((patch: Partial<AuthUser>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const url = await initZkLogin();
    window.location.href = url;
  }, []);

  const signOut = useCallback(() => {
    clearZkLogin();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signInWithGoogle,
        signOut,
        refreshUser,
        updateUser,
        onZkLoginComplete,
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
