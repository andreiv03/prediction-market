import { Market } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useNavigate } from "@tanstack/react-router";

interface MarketCardProps {
  market: Market;
  isAdmin?: boolean;
  actionInProgress?: boolean;
  onResolve?: (outcomeId: number) => void;
  onArchive?: () => void;
}

export function MarketCard({
  market,
  isAdmin = false,
  actionInProgress = false,
  onResolve,
  onArchive,
}: MarketCardProps) {
  const navigate = useNavigate();
  const isActionable = isAdmin && market.status === "active";

  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <CardTitle className="text-xl">{market.title}</CardTitle>
            <CardDescription>By: {market.creator || "Unknown"}</CardDescription>
          </div>
          <Badge variant={market.status === "active" ? "default" : "secondary"}>
            {market.status === "active"
              ? "Active"
              : market.status === "resolved"
                ? "Resolved"
                : "Archived"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex h-full flex-col gap-4">
        <div className="space-y-2">
          {market.outcomes.map((outcome) => (
            <div
              key={outcome.id}
              className="flex items-center justify-between bg-secondary/20 p-3 rounded-md"
            >
              <div>
                <p className="text-sm font-medium">{outcome.title}</p>
                <p className="text-xs text-muted-foreground">${outcome.totalBets.toFixed(2)} total</p>
              </div>
              <div className="text-right space-y-2">
                <p className="text-lg font-bold">{outcome.odds}%</p>
                {isActionable && onResolve && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={actionInProgress}
                    onClick={() => onResolve(outcome.id)}
                  >
                    Resolve Here
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-auto space-y-2">
          <div className="p-3 rounded-md border border-primary/20 bg-primary/5">
            <p className="text-xs text-muted-foreground">Total Market Value</p>
            <p className="text-2xl font-bold text-primary">${market.totalMarketBets.toFixed(2)}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {market.participantCount} participant{market.participantCount === 1 ? "" : "s"}
            </p>
          </div>

          <Button className="w-full" onClick={() => navigate({ to: `/markets/${market.id}` })}>
            {market.status === "active" ? "Place Bet" : "View Results"}
          </Button>

          {isActionable && onArchive && (
            <Button
              className="w-full font-semibold"
              variant="destructive"
              disabled={actionInProgress}
              onClick={onArchive}
            >
              Archive and Refund
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
