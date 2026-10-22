import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "./shared/types";
import { api, errorText, post } from "./lib/api";
import { Spinner } from "./components/ui";
import { AuthScreen } from "./pages/AuthScreen";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";

const Workspace = lazy(() =>
  import("./components/Workspace").then((m) => ({ default: m.Workspace })),
);

export function App() {
  const [session, setSession] = useState<User | null | undefined>(),
    [setup, setSetup] = useState(false),
    [error, setError] = useState("");
  const client = useQueryClient();
  const refresh = useCallback(async () => {
    try {
      const [auth, status] = await Promise.all([
        api<{ user: User } | null>("/auth/get-session"),
        api<{ needsSetup: boolean }>("/setup/status"),
      ]);
      setSession(auth?.user || null);
      setSetup(status.needsSetup);
    } catch (e) {
      setError(errorText(e));
      setSession(null);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const expire = () => {
      client.clear();
      setSession(null);
    };
    window.addEventListener("session-expired", expire);
    return () => window.removeEventListener("session-expired", expire);
  }, [client, refresh]);
  if (session === undefined) return <Spinner />;
  if (!session)
    return <AuthScreen setup={setup} error={error} onSuccess={refresh} />;
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<Spinner />}>
        <Workspace
          onSignOut={async () => {
            await post("/auth/sign-out", {});
            client.clear();
            setSession(null);
          }}
        />
      </Suspense>
    </RouteErrorBoundary>
  );
}
