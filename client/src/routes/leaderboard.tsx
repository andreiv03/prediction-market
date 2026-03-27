import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { api, LeaderboardEntry, PaginatedResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function LeaderboardPage() {
  const navigate = useNavigate();
  const [leaderboard, setLeaderboard] = useState<PaginatedResponse<LeaderboardEntry> | null>(null);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadLeaderboard = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await api.getLeaderboard(page);
        setLeaderboard(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load leaderboard");
      } finally {
        setIsLoading(false);
      }
    };

    loadLeaderboard();
  }, [page]);

  const entries = leaderboard?.items || [];
  const pagination = leaderboard?.pagination;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8">
      <div className="max-w-3xl mx-auto px-4 space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">Leaderboard</h1>
            <p className="text-gray-600 mt-2">Ranked by total winnings</p>
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

        <Card>
          <CardHeader>
            <CardTitle>Top Traders</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <p className="text-muted-foreground">Loading leaderboard...</p>
            ) : entries.length === 0 ? (
              <p className="text-muted-foreground">No users ranked yet.</p>
            ) : (
              entries.map((entry, index) => (
                <div
                  key={entry.userId}
                  className="flex flex-col gap-2 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold">
                      #{((pagination?.page || 1) - 1) * (pagination?.pageSize || 20) + index + 1}{" "}
                      {entry.username}
                    </p>
                  </div>
                  <p className="text-lg font-bold text-primary">${entry.totalWinnings.toFixed(2)}</p>
                </div>
              ))
            )}

            {pagination && (
              <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-center sm:justify-between">
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
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardPage,
});
