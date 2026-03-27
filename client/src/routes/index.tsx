import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { api, Market, PaginatedResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { MarketCard } from "@/components/market-card";
import { useNavigate } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

function DashboardPage() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const [marketResponse, setMarketResponse] = useState<PaginatedResponse<Market> | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"active" | "resolved" | "archived">("active");
  const [sortBy, setSortBy] = useState<"createdAt" | "totalBets" | "participants">("createdAt");
  const [page, setPage] = useState(1);
  const [actionMarketId, setActionMarketId] = useState<number | null>(null);

  const loadMarkets = async (background = false) => {
    try {
      if (!background) {
        setIsLoading(true);
      }
      if (!background) {
        setError(null);
      }
      const data = await api.listMarkets(status, sortBy, page);
      setMarketResponse(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load markets");
    } finally {
      if (!background) {
        setIsLoading(false);
      }
    }
  };

  useEffect(() => {
    loadMarkets();
  }, [status, sortBy, page]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void loadMarkets(true);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [isAuthenticated, page, sortBy, status]);

  useEffect(() => {
    setPage(1);
  }, [status, sortBy]);

  const markets = marketResponse?.items || [];
  const pagination = marketResponse?.pagination;

  const handleResolveMarket = async (marketId: number, outcomeId: number) => {
    try {
      setActionMarketId(marketId);
      setError(null);
      await api.resolveMarket(marketId, outcomeId);
      await loadMarkets(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve market");
    } finally {
      setActionMarketId(null);
    }
  };

  const handleArchiveMarket = async (marketId: number) => {
    try {
      setActionMarketId(marketId);
      setError(null);
      await api.archiveMarket(marketId);
      await loadMarkets(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive market");
    } finally {
      setActionMarketId(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center px-4">
          <h1 className="text-3xl sm:text-4xl font-bold mb-4 text-gray-900">Prediction Markets</h1>
          <p className="text-gray-600 mb-8 text-lg">Create and participate in prediction markets</p>
          <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Button className="w-full sm:w-auto" onClick={() => navigate({ to: "/auth/login" })}>
              Login
            </Button>
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              onClick={() => navigate({ to: "/auth/register" })}
            >
              Sign Up
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Markets</h1>
            <p className="text-gray-600 mt-2">Welcome back, {user?.username}!</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:justify-start lg:justify-end">
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              onClick={() => navigate({ to: "/leaderboard" })}
            >
              Leaderboard
            </Button>
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              onClick={() => navigate({ to: "/profile" })}
            >
              Profile
            </Button>
            <Button
              className="w-full sm:w-auto"
              variant="outline"
              onClick={() => navigate({ to: "/auth/logout" })}
            >
              Logout
            </Button>
            <Button className="w-full sm:w-auto" onClick={() => navigate({ to: "/markets/new" })}>
              Create Market
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 space-y-3">
          <div className="flex flex-wrap gap-4">
            <Button
              variant={status === "active" ? "default" : "outline"}
              onClick={() => setStatus("active")}
            >
              Active Markets
            </Button>
            <Button
              variant={status === "resolved" ? "default" : "outline"}
              onClick={() => setStatus("resolved")}
            >
              Resolved Markets
            </Button>
            <Button
              variant={status === "archived" ? "default" : "outline"}
              onClick={() => setStatus("archived")}
            >
              Archived Markets
            </Button>
          </div>

          <div className="flex flex-wrap gap-4">
            <Button
              variant={sortBy === "createdAt" ? "default" : "outline"}
              onClick={() => setSortBy("createdAt")}
            >
              Newest
            </Button>
            <Button
              variant={sortBy === "totalBets" ? "default" : "outline"}
              onClick={() => setSortBy("totalBets")}
            >
              Biggest Pools
            </Button>
            <Button
              variant={sortBy === "participants" ? "default" : "outline"}
              onClick={() => setSortBy("participants")}
            >
              Most Participants
            </Button>
          </div>

          <div>
            <Button className="w-full sm:w-auto" variant="outline" onClick={loadMarkets} disabled={isLoading}>
              {isLoading ? "Refreshing..." : "Refresh"}
            </Button>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-6">
          Markets auto-refresh every 5 seconds.
        </p>

        {/* Error State */}
        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive mb-6">
            {error}
          </div>
        )}

        {/* Markets Grid */}
        {isLoading ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <p className="text-muted-foreground">Loading markets...</p>
            </CardContent>
          </Card>
        ) : markets.length === 0 ? (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <div className="text-center">
                <p className="text-muted-foreground text-lg">
                  No {status} markets found. {status === "active" && "Create one to get started!"}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {markets.map((market) => (
                <MarketCard
                  key={market.id}
                  market={market}
                  isAdmin={user?.role === "admin"}
                  actionInProgress={actionMarketId === market.id}
                  onResolve={(outcomeId) => handleResolveMarket(market.id, outcomeId)}
                  onArchive={() => handleArchiveMarket(market.id)}
                />
              ))}
            </div>

            {pagination && (
              <Card>
                <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages}
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:flex">
                    <Button
                      className="w-full sm:w-auto"
                      variant="outline"
                      disabled={!pagination.hasPreviousPage || isLoading}
                      onClick={() => setPage((current) => Math.max(1, current - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      className="w-full sm:w-auto"
                      variant="outline"
                      disabled={!pagination.hasNextPage || isLoading}
                      onClick={() => setPage((current) => current + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export const Route = createFileRoute("/")({
  component: DashboardPage,
});
