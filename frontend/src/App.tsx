import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth, AuthProvider } from "./hooks/useAuth";
import { apiGet } from "./lib/api";
import type { MarketGroup } from "../../shared/types";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";
import Chat from "./pages/Chat";
import Feed from "./pages/Feed";
import Profile from "./pages/Profile";
import Leaderboard from "./pages/Leaderboard";
import MemoryMap from "./pages/MemoryMap";
import Predictions from "./pages/Predictions";
import ErrorBoundary from "./components/ErrorBoundary";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" />;
  if (!user.username) return <Navigate to="/onboarding" />;
  return <>{children}</>;
}

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background font-mono">
      <div className="text-center">
        <img
          src="/vela.jpg"
          className="mx-auto mb-4 h-12 w-12 rounded-md object-cover"
          alt="Vela"
        />
        <div className="text-sm text-muted-foreground">Vela is waking up...</div>
      </div>
    </div>
  );
}

function PrefetchData() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (user) {
      queryClient.prefetchQuery({
        queryKey: ["markets"],
        queryFn: () => apiGet<MarketGroup[]>("/markets"),
        staleTime: 30_000,
      });
    }
  }, [user, queryClient]);

  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <PrefetchData />
          <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/onboarding" element={<Onboarding />} />
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Chat />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/feed"
                element={
                  <ProtectedRoute>
                    <Feed />
                  </ProtectedRoute>
                }
              />
              <Route path="/u/:username" element={<Profile />} />
              <Route path="/u/:username/predictions" element={<Predictions />} />
              <Route path="/leaderboard" element={<Leaderboard />} />
              <Route path="/memory" element={<MemoryMap />} />
              <Route path="/memory/:username" element={<MemoryMap />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
    </ErrorBoundary>
  );
}
