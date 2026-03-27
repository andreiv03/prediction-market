import { Elysia, t } from "elysia";
import { handleGetLeaderboard } from "./handlers";

export const leaderboardRoutes = new Elysia({ prefix: "/api/leaderboard" }).get(
  "/",
  handleGetLeaderboard,
  {
    query: t.Object({
      page: t.Optional(t.Numeric()),
    }),
  },
);
