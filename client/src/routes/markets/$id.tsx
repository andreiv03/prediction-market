import { useEffect, useState } from "react";
import { useParams, useNavigate, createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { api, Market } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

function MarketDetailPage() {
  const { id } = useParams({ from: "/markets/$id" });
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const [market, setMarket] = useState<Market | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedOutcomeId, setSelectedOutcomeId] = useState<number | null>(null);
  const [betAmount, setBetAmount] = useState("");
  const [isBetting, setIsBetting] = useState(false);
  const [isResolving, setIsResolving] = useState(false);

  const marketId = parseInt(id, 10);

  useEffect(() => {
    const loadMarket = async () => {
      try {
        setIsLoading(true);
        const data = await api.getMarket(marketId);
        setMarket(data);
        if (data.outcomes.length > 0) {
          setSelectedOutcomeId(data.outcomes[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load market details");
      } finally {
        setIsLoading(false);
      }
    };

    loadMarket();
  }, [marketId]);

  const handlePlaceBet = async () => {
    if (!selectedOutcomeId || !betAmount) {
      setError("Please select an outcome and enter a bet amount");
      return;
    }

    const parsedAmount = parseFloat(betAmount);
    if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      setError("Bet amount must be a positive number");
      return;
    }

    try {
      setIsBetting(true);
      setError(null);
      await api.placeBet(marketId, selectedOutcomeId, parsedAmount);
      setBetAmount("");
      // Reload market to show updated odds
      const updated = await api.getMarket(marketId);
      setMarket(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to place bet");
    } finally {
      setIsBetting(false);
    }
  };

  const handleResolveMarket = async () => {
    if (!selectedOutcomeId) {
      setError("Select the winning outcome first");
      return;
    }

    try {
      setIsResolving(true);
      setError(null);
      await api.resolveMarket(marketId, selectedOutcomeId);
      const updated = await api.getMarket(marketId);
      setMarket(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resolve market");
    } finally {
      setIsResolving(false);
    }
  };

  const handleArchiveMarket = async () => {
    try {
      setIsResolving(true);
      setError(null);
      await api.archiveMarket(marketId);
      const updated = await api.getMarket(marketId);
      setMarket(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive market");
    } finally {
      setIsResolving(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <p className="text-muted-foreground">Please log in to view this market</p>
            <Button onClick={() => navigate({ to: "/auth/login" })}>Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading market...</p>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <p className="text-destructive">Market not found</p>
            <Button onClick={() => navigate({ to: "/" })}>Back to Markets</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8">
      <div className="max-w-3xl mx-auto px-4 space-y-6">
        {/* Header */}
        <Button className="w-full sm:w-auto" variant="outline" onClick={() => navigate({ to: "/" })}>
          ← Back
        </Button>

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex-1">
                <CardTitle className="text-3xl sm:text-4xl">{market.title}</CardTitle>
                {market.description && (
                  <CardDescription className="text-lg mt-2">{market.description}</CardDescription>
                )}
              </div>
              <Badge variant={market.status === "active" ? "default" : "secondary"}>
                {market.status === "active" ? "Active" : "Resolved"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {error && (
              <div className="rounded-md bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* Outcomes Display */}
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Outcome Breakdown</h3>
              {market.outcomes.map((outcome) => (
                <div
                  key={outcome.id}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-colors ${
                    selectedOutcomeId === outcome.id
                      ? "border-primary bg-primary/5"
                      : "border-secondary bg-secondary/5 hover:border-primary/50"
                  }`}
                  onClick={() => market.status === "active" && setSelectedOutcomeId(outcome.id)}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold">{outcome.title}</h4>
                      <p className="text-sm text-muted-foreground mt-1">
                        Total bets: ${outcome.totalBets.toFixed(2)}
                      </p>
                      <div className="mt-3 h-2 rounded-full bg-secondary/60 overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${outcome.odds}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-3xl font-bold text-primary">{outcome.odds}%</p>
                      <p className="text-xs text-muted-foreground">odds</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Market Stats */}
            <div className="rounded-lg p-6 border border-primary/20 bg-primary/5">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Total Market Value</p>
                  <p className="text-4xl font-bold text-primary">
                    ${market.totalMarketBets.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Participants</p>
                  <p className="text-4xl font-bold text-primary">{market.participantCount}</p>
                </div>
              </div>
            </div>

            {/* Betting Section */}
            {market.status === "active" && (
              <Card className="bg-secondary/5">
                <CardHeader>
                  <CardTitle>Place Your Bet</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Selected Outcome</Label>
                    <div className="p-3 bg-white border border-secondary rounded-md">
                      {market.outcomes.find((o) => o.id === selectedOutcomeId)?.title ||
                        "None selected"}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="betAmount">Bet Amount ($)</Label>
                    <Input
                      id="betAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      value={betAmount}
                      onChange={(e) => setBetAmount(e.target.value)}
                      placeholder="Enter amount"
                      disabled={isBetting}
                    />
                  </div>

                  <Button
                    className="w-full text-lg py-6"
                    onClick={handlePlaceBet}
                    disabled={isBetting || !selectedOutcomeId || !betAmount}
                  >
                    {isBetting ? "Placing bet..." : "Place Bet"}
                  </Button>
                </CardContent>
              </Card>
            )}

            {user?.role === "admin" && market.status === "active" && (
              <Card className="border-amber-300 bg-amber-50/80">
                <CardHeader>
                  <CardTitle>Admin Controls</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Resolve the market with the selected winning outcome, or archive it and refund all bets.
                  </p>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Button
                      className="w-full sm:w-auto"
                      onClick={handleResolveMarket}
                      disabled={isResolving || !selectedOutcomeId}
                    >
                      {isResolving ? "Processing..." : "Resolve Market"}
                    </Button>
                    <Button
                      className="w-full font-semibold sm:w-auto"
                      variant="destructive"
                      onClick={handleArchiveMarket}
                      disabled={isResolving}
                    >
                      Archive and Refund
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {market.status === "resolved" && (
              <Card>
                <CardContent className="py-6">
                  <p className="text-muted-foreground">
                    This market has been resolved.
                    {market.resolvedOutcome ? ` Winner: ${market.resolvedOutcome.title}.` : ""}
                  </p>
                </CardContent>
              </Card>
            )}

            {market.status === "archived" && (
              <Card>
                <CardContent className="py-6">
                  <p className="text-muted-foreground">
                    This market was archived and all bettors were refunded.
                  </p>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/markets/$id")({
  component: MarketDetailPage,
});
