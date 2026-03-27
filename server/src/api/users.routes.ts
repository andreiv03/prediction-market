import { Elysia, t } from "elysia";
import { authMiddleware } from "../middleware/auth.middleware";
import { handleGenerateApiKey, handleGetProfile, handleRevokeApiKey } from "./handlers";

export const userRoutes = new Elysia({ prefix: "/api/users" })
  .use(authMiddleware)
  .guard(
    {
      beforeHandle({ user, set }) {
        if (!user) {
          set.status = 401;
          return { error: "Unauthorized" };
        }
      },
    },
    (app) =>
      app
        .get("/me", handleGetProfile, {
          query: t.Object({
            activePage: t.Optional(t.Numeric()),
            resolvedPage: t.Optional(t.Numeric()),
          }),
        })
        .post("/me/api-key", handleGenerateApiKey)
        .delete("/me/api-key", handleRevokeApiKey),
  );
