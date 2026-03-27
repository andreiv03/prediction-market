import { describe, it, expect, beforeAll } from "bun:test";
import { eq } from "drizzle-orm";
import { app } from "../index";
import db from "../src/db";
import { runMigrations } from "../src/db/migrate";
import { marketsTable, usersTable } from "../src/db/schema";
import { hashPassword } from "../src/lib/auth";

const BASE = "http://localhost";

// Shared state across tests (populated by earlier tests, consumed by later ones)
let authToken: string;
let userId: number;
let marketId: number;
let outcomeId: number;
let adminToken: string;
let secondUserToken: string;
let secondUserId: number;
let apiKey: string;

beforeAll(async () => {
  await runMigrations();

  const passwordHash = await hashPassword("adminpass123");
  await db.insert(usersTable).values({
    username: "adminuser",
    email: "admin@example.com",
    passwordHash,
    role: "admin",
    balance: 1000,
  });

  const adminLoginResponse = await app.handle(
    new Request(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "adminpass123" }),
    }),
  );

  const adminLoginData = await adminLoginResponse.json();
  adminToken = adminLoginData.token;
});

describe("Auth", () => {
  const username = "testuser";
  const email = "test@example.com";
  const password = "testpass123";

  it("POST /api/auth/register — creates a new user", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      }),
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.username).toBe(username);
    expect(data.email).toBe(email);
    expect(data.role).toBe("user");
    expect(data.balance).toBe(1000);
    expect(data.token).toBeDefined();

    authToken = data.token;
    userId = data.id;
  });

  it("POST /api/auth/register — rejects duplicate user", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      }),
    );

    expect(res.status).toBe(409);
  });

  it("POST /api/auth/register — validates input", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "ab", email: "bad", password: "12" }),
      }),
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it("POST /api/auth/login — logs in with valid credentials", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(userId);
    expect(data.role).toBe("user");
    expect(data.balance).toBe(1000);
    expect(data.token).toBeDefined();
  });

  it("POST /api/auth/login — rejects invalid credentials", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "nobody@example.com", password: "wrong" }),
      }),
    );

    expect(res.status).toBe(401);
  });
});

describe("Markets", () => {
  it("POST /api/markets — requires auth", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "Test market",
          outcomes: ["Yes", "No"],
        }),
      }),
    );

    expect(res.status).toBe(401);
  });

  it("POST /api/markets — creates a market", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          title: "Will it rain tomorrow?",
          description: "Weather prediction",
          outcomes: ["Yes", "No"],
        }),
      }),
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.title).toBe("Will it rain tomorrow?");
    expect(data.outcomes).toHaveLength(2);

    marketId = data.id;
    outcomeId = data.outcomes[0].id;
  });

  it("POST /api/markets — validates input", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ title: "Hi", outcomes: ["Only one"] }),
      }),
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it("GET /api/markets — lists markets", async () => {
    const res = await app.handle(new Request(`${BASE}/api/markets`));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.pagination.page).toBe(1);
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.items[0].id).toBeDefined();
    expect(data.items[0].title).toBeDefined();
    expect(data.items[0].outcomes).toBeDefined();
  });

  it("GET /api/markets/:id — returns market detail", async () => {
    const res = await app.handle(new Request(`${BASE}/api/markets/${marketId}`));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.id).toBe(marketId);
    expect(data.title).toBe("Will it rain tomorrow?");
    expect(data.description).toBe("Weather prediction");
    expect(data.outcomes).toHaveLength(2);
  });

  it("GET /api/markets/:id — 404 for nonexistent market", async () => {
    const res = await app.handle(new Request(`${BASE}/api/markets/99999`));

    expect(res.status).toBe(404);
  });
});

describe("Bets", () => {
  it("POST /api/markets/:id/bets — requires auth", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets/${marketId}/bets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcomeId, amount: 100 }),
      }),
    );

    expect(res.status).toBe(401);
  });

  it("POST /api/markets/:id/bets — places a bet", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets/${marketId}/bets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ outcomeId, amount: 50 }),
      }),
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBeDefined();
    expect(data.userId).toBe(userId);
    expect(data.marketId).toBe(marketId);
    expect(data.outcomeId).toBe(outcomeId);
    expect(data.amount).toBe(50);
    expect(data.balance).toBe(950);
  });

  it("POST /api/markets/:id/bets — validates amount", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets/${marketId}/bets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ outcomeId, amount: -10 }),
      }),
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it("POST /api/markets/:id/bets — rejects bets larger than available balance", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets/${marketId}/bets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ outcomeId, amount: 5000 }),
      }),
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Insufficient balance");
  });
});

describe("Admin market resolution", () => {
  it("POST /api/auth/register — creates a second user for payout tests", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "seconduser",
          email: "second@example.com",
          password: "testpass123",
        }),
      }),
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    secondUserId = data.id;
    secondUserToken = data.token;
  });

  it("POST /api/markets/:id/resolve — requires admin", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets/${marketId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ outcomeId }),
      }),
    );

    expect(res.status).toBe(403);
  });

  it("POST /api/markets/:id/resolve — resolves the market and pays winners", async () => {
    const secondBetResponse = await app.handle(
      new Request(`${BASE}/api/markets/${marketId}/bets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secondUserToken}`,
        },
        body: JSON.stringify({ outcomeId, amount: 150 }),
      }),
    );

    expect(secondBetResponse.status).toBe(201);

    const res = await app.handle(
      new Request(`${BASE}/api/markets/${marketId}/resolve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ outcomeId }),
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.status).toBe("resolved");
    expect(data.winners).toBe(2);

    const [updatedFirstUser, updatedSecondUser, updatedMarket] = await Promise.all([
      db.query.usersTable.findFirst({ where: eq(usersTable.id, userId) }),
      db.query.usersTable.findFirst({ where: eq(usersTable.id, secondUserId) }),
      db.query.marketsTable.findFirst({ where: eq(marketsTable.id, marketId) }),
    ]);

    expect(updatedFirstUser?.balance).toBe(1000);
    expect(updatedSecondUser?.balance).toBe(1000);
    expect(updatedMarket?.status).toBe("resolved");
    expect(updatedMarket?.resolvedOutcomeId).toBe(outcomeId);
  });
});

describe("Profile and leaderboard", () => {
  it("GET /api/users/me — returns paginated active and resolved bets", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/users/me?activePage=1&resolvedPage=1`, {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.id).toBe(userId);
    expect(data.user.balance).toBe(1000);
    expect(data.activeBets.pagination.page).toBe(1);
    expect(data.resolvedBets.pagination.page).toBe(1);
    expect(data.activeBets.items).toHaveLength(0);
    expect(data.resolvedBets.items).toHaveLength(1);
    expect(data.resolvedBets.items[0].didWin).toBe(true);
    expect(data.resolvedBets.items[0].marketId).toBe(marketId);
  });

  it("GET /api/leaderboard — ranks users by winnings", async () => {
    const res = await app.handle(new Request(`${BASE}/api/leaderboard?page=1`));

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.items)).toBe(true);
    expect(data.pagination.page).toBe(1);
    expect(data.items.length).toBeGreaterThan(0);
    if (data.items.length > 1) {
      expect(data.items[0].totalWinnings).toBeGreaterThanOrEqual(data.items[1].totalWinnings);
    }
  });
});

describe("API keys", () => {
  it("POST /api/users/me/api-key — generates an API key", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/users/me/api-key`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }),
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(typeof data.apiKey).toBe("string");
    expect(data.apiKey.startsWith("pm_")).toBe(true);
    apiKey = data.apiKey;
  });

  it("POST /api/markets — accepts API key auth", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          title: "Will a bot market work?",
          description: "Created with an API key",
          outcomes: ["Yes", "No"],
        }),
      }),
    );

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.title).toBe("Will a bot market work?");
  });

  it("DELETE /api/users/me/api-key — revokes the API key", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/users/me/api-key`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });

  it("POST /api/markets — rejects revoked API keys", async () => {
    const res = await app.handle(
      new Request(`${BASE}/api/markets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify({
          title: "This should fail",
          outcomes: ["Yes", "No"],
        }),
      }),
    );

    expect(res.status).toBe(401);
  });
});

describe("Error handling", () => {
  it("returns 404 JSON for unknown routes", async () => {
    const res = await app.handle(new Request(`${BASE}/nonexistent`));

    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("Not found");
  });
});
