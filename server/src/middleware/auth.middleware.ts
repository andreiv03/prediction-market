import { Elysia } from "elysia";
import { getUserByApiKey, getUserById } from "../lib/auth";

export const authMiddleware = new Elysia({ name: "auth-middleware" })
  .derive(async ({ headers, jwt }) => {
    const authHeader = headers["authorization"];
    const apiKeyHeader = headers["x-api-key"];

    if (apiKeyHeader) {
      const user = await getUserByApiKey(apiKeyHeader);
      return { user };
    }

    if (authHeader?.startsWith("ApiKey ")) {
      const user = await getUserByApiKey(authHeader.substring(7));
      return { user };
    }

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return { user: null };
    }

    const token = authHeader.substring(7);
    const payload = await jwt.verify(token);
    if (!payload) {
      return { user: null };
    }

    const user = await getUserById(payload.userId);
    return { user };
  })
  .as("plugin");
