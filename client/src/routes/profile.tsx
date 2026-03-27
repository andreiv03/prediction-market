import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { api, ProfileResponse } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function ProfilePage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [activePage, setActivePage] = useState(1);
  const [resolvedPage, setResolvedPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatedApiKey, setGeneratedApiKey] = useState<string | null>(null);
  const [apiKeyActionLoading, setApiKeyActionLoading] = useState(false);

  const loadProfile = async (background = false) => {
    try {
      if (!background) {
        setIsLoading(true);
      }
      if (!background) {
        setError(null);
      }
      const data = await api.getProfile(activePage, resolvedPage);
      setProfile(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      if (!background) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      navigate({ to: "/auth/login" });
      return;
    }

    void loadProfile();
  }, [activePage, isAuthenticated, navigate, resolvedPage]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadProfile(true);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [activePage, isAuthenticated, resolvedPage]);

  if (!isAuthenticated) {
    return null;
  }

  const handleGenerateApiKey = async () => {
    try {
      setApiKeyActionLoading(true);
      setError(null);
      const response = await api.generateApiKey();
      setGeneratedApiKey(response.apiKey);
      await loadProfile(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate API key");
    } finally {
      setApiKeyActionLoading(false);
    }
  };

  const handleRevokeApiKey = async () => {
    try {
      setApiKeyActionLoading(true);
      setError(null);
      await api.revokeApiKey();
      setGeneratedApiKey(null);
      await loadProfile(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke API key");
    } finally {
      setApiKeyActionLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8">
      <div className="max-w-5xl mx-auto px-4 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Profile</h1>
            {profile && (
              <p className="text-gray-600 mt-2">
                {profile.user.username} · Balance ${profile.user.balance.toFixed(2)}
              </p>
            )}
          </div>
          <Button className="w-full sm:w-auto" variant="outline" onClick={() => navigate({ to: "/" })}>
            Back to Markets
          </Button>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        <p className="text-sm text-muted-foreground">
          Profile data auto-refreshes every 5 seconds.
        </p>

        {isLoading || !profile ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Loading profile...
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>API Access</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Generate an API key to let bots reuse the same market creation and betting endpoints.
                </p>

                {profile.user.hasApiKey && (
                  <p className="text-sm text-muted-foreground">
                    Active key created{" "}
                    {profile.user.apiKeyCreatedAt
                      ? new Date(profile.user.apiKeyCreatedAt).toLocaleString()
                      : "recently"}
                  </p>
                )}

                {generatedApiKey && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-2">
                    <p className="text-sm font-medium">Copy this API key now. It will only be shown once.</p>
                    <code className="block rounded bg-white px-3 py-2 text-sm break-all">
                      {generatedApiKey}
                    </code>
                    <p className="text-xs text-muted-foreground">
                      Use it with the `X-API-Key` header or `Authorization: ApiKey ...`
                    </p>
                  </div>
                )}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <Button className="w-full sm:w-auto" onClick={handleGenerateApiKey} disabled={apiKeyActionLoading}>
                    {apiKeyActionLoading ? "Working..." : profile.user.hasApiKey ? "Regenerate API Key" : "Generate API Key"}
                  </Button>
                  {profile.user.hasApiKey && (
                    <Button
                      className="w-full sm:w-auto"
                      variant="outline"
                      onClick={handleRevokeApiKey}
                      disabled={apiKeyActionLoading}
                    >
                      Revoke API Key
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active Bets</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {profile.activeBets.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No active bets yet.</p>
                ) : (
                  profile.activeBets.items.map((bet) => (
                    <div key={bet.betId} className="rounded-lg border p-4 space-y-1">
                      <p className="font-semibold">{bet.marketTitle}</p>
                      <p className="text-sm text-muted-foreground">
                        {bet.outcomeTitle} · ${bet.amount.toFixed(2)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Current odds {bet.currentOdds}% · Pool ${bet.currentTotalBets.toFixed(2)}
                      </p>
                    </div>
                  ))
                )}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Page {profile.activeBets.pagination.page} of {profile.activeBets.pagination.totalPages}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:flex">
                    <Button
                      className="w-full sm:w-auto"
                      variant="outline"
                      disabled={!profile.activeBets.pagination.hasPreviousPage}
                      onClick={() => setActivePage((page) => Math.max(1, page - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      className="w-full sm:w-auto"
                      variant="outline"
                      disabled={!profile.activeBets.pagination.hasNextPage}
                      onClick={() => setActivePage((page) => page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Resolved Bets</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {profile.resolvedBets.items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No resolved bets yet.</p>
                ) : (
                  profile.resolvedBets.items.map((bet) => (
                    <div key={bet.betId} className="rounded-lg border p-4 space-y-1">
                      <p className="font-semibold">{bet.marketTitle}</p>
                      <p className="text-sm text-muted-foreground">
                        Picked {bet.outcomeTitle} · ${bet.amount.toFixed(2)}
                      </p>
                      <p
                        className={`text-sm font-medium ${bet.didWin ? "text-emerald-600" : "text-rose-600"}`}
                      >
                        {bet.didWin ? "Won" : "Lost"}
                        {bet.winningOutcomeTitle ? ` · Winner: ${bet.winningOutcomeTitle}` : ""}
                      </p>
                    </div>
                  ))
                )}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Page {profile.resolvedBets.pagination.page} of{" "}
                    {profile.resolvedBets.pagination.totalPages}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:flex">
                    <Button
                      className="w-full sm:w-auto"
                      variant="outline"
                      disabled={!profile.resolvedBets.pagination.hasPreviousPage}
                      onClick={() => setResolvedPage((page) => Math.max(1, page - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      className="w-full sm:w-auto"
                      variant="outline"
                      disabled={!profile.resolvedBets.pagination.hasNextPage}
                      onClick={() => setResolvedPage((page) => page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});
