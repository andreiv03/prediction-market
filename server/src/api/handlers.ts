import { and, eq, sql } from "drizzle-orm";
import db from "../db";
import { usersTable, marketsTable, marketOutcomesTable, betsTable } from "../db/schema";
import {
  generateApiKey,
  hashApiKey,
  hashPassword,
  verifyPassword,
  type AuthTokenPayload,
} from "../lib/auth";
import { calculatePayouts } from "../lib/odds";
import {
  validateRegistration,
  validateLogin,
  validateMarketCreation,
  validateBet,
} from "../lib/validation";

type JwtSigner = {
  sign: (payload: AuthTokenPayload) => Promise<string>;
};

type AuthenticatedUser = typeof usersTable.$inferSelect;

type MutableStatus = {
  status: number;
};

function paginateItems<T>(items: T[], page: number, pageSize = 20) {
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const startIndex = (safePage - 1) * pageSize;

  return {
    items: items.slice(startIndex, startIndex + pageSize),
    pagination: {
      page: safePage,
      pageSize,
      totalItems,
      totalPages,
      hasPreviousPage: safePage > 1,
      hasNextPage: safePage < totalPages,
    },
  };
}

async function buildMarketSummary(marketId: number) {
  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, marketId),
    with: {
      creator: {
        columns: { username: true },
      },
      outcomes: {
        orderBy: (outcomes, { asc }) => asc(outcomes.position),
      },
      resolvedOutcome: {
        columns: { id: true, title: true },
      },
    },
  });

  if (!market) {
    return null;
  }

  const totalsByOutcome = new Map<number, number>();
  const marketBets = await db.query.betsTable.findMany({
    where: eq(betsTable.marketId, marketId),
  });

  for (const bet of marketBets) {
    totalsByOutcome.set(bet.outcomeId, Number((totalsByOutcome.get(bet.outcomeId) || 0) + bet.amount));
  }

  const totalMarketBets = market.outcomes.reduce(
    (sum, outcome) => sum + (totalsByOutcome.get(outcome.id) || 0),
    0,
  );
  const participantCount = new Set(marketBets.map((bet) => bet.userId)).size;

  return {
    id: market.id,
    title: market.title,
    description: market.description,
    status: market.status,
    createdAt: market.createdAt,
    creator: market.creator?.username,
    resolvedOutcome: market.resolvedOutcome
      ? {
          id: market.resolvedOutcome.id,
          title: market.resolvedOutcome.title,
        }
      : null,
    resolvedAt: market.resolvedAt,
    participantCount,
    outcomes: market.outcomes.map((outcome) => {
      const outcomeBets = totalsByOutcome.get(outcome.id) || 0;
      const odds =
        totalMarketBets > 0 ? Number(((outcomeBets / totalMarketBets) * 100).toFixed(2)) : 0;

      return {
        id: outcome.id,
        title: outcome.title,
        odds,
        totalBets: outcomeBets,
      };
    }),
    totalMarketBets,
  };
}

function requireAdmin(user: AuthenticatedUser | null, set: MutableStatus) {
  if (!user || user.role !== "admin") {
    set.status = 403;
    return { error: "Admin access required" };
  }

  return null;
}

export async function handleRegister({
  body,
  jwt,
  set,
}: {
  body: { username: string; email: string; password: string };
  jwt: JwtSigner;
  set: MutableStatus;
}) {
  const { username, email, password } = body;
  const errors = validateRegistration(username, email, password);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const existingUser = await db.query.usersTable.findFirst({
    where: (users, { or, eq }) => or(eq(users.email, email), eq(users.username, username)),
  });

  if (existingUser) {
    set.status = 409;
    return { errors: [{ field: "email", message: "User already exists" }] };
  }

  const passwordHash = await hashPassword(password);
  const [newUser] = await db
    .insert(usersTable)
    .values({ username, email, passwordHash, role: "user", balance: 1000 })
    .returning();

  const token = await jwt.sign({ userId: newUser.id });

  set.status = 201;
  return {
    id: newUser.id,
    username: newUser.username,
    email: newUser.email,
    role: newUser.role,
    balance: newUser.balance,
    token,
  };
}

export async function handleLogin({
  body,
  jwt,
  set,
}: {
  body: { email: string; password: string };
  jwt: JwtSigner;
  set: MutableStatus;
}) {
  const { email, password } = body;
  const errors = validateLogin(email, password);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const user = await db.query.usersTable.findFirst({
    where: eq(usersTable.email, email),
  });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    set.status = 401;
    return { error: "Invalid email or password" };
  }

  const token = await jwt.sign({ userId: user.id });

  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    balance: user.balance,
    token,
  };
}

export async function handleCreateMarket({
  body,
  set,
  user,
}: {
  body: { title: string; description?: string; outcomes: string[] };
  set: MutableStatus;
  user: AuthenticatedUser;
}) {
  const { title, description, outcomes } = body;
  const errors = validateMarketCreation(title, description || "", outcomes);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const [market] = await db
    .insert(marketsTable)
    .values({
      title,
      description: description || null,
      createdBy: user.id,
    })
    .returning();

  const createdOutcomes = await db
    .insert(marketOutcomesTable)
    .values(
      outcomes.map((outcomeTitle, index) => ({
        marketId: market.id,
        title: outcomeTitle,
        position: index,
      })),
    )
    .returning();

  set.status = 201;
  return {
    id: market.id,
    title: market.title,
    description: market.description,
    status: market.status,
    outcomes: createdOutcomes,
  };
}

export async function handleListMarkets({
  query,
}: {
  query: {
    status?: string;
    sortBy?: "createdAt" | "totalBets" | "participants";
    page?: number;
  };
}) {
  const statusFilter = (query.status || "active") as "active" | "resolved" | "archived";
  const sortBy = query.sortBy || "createdAt";
  const page = query.page || 1;

  const markets = await db.query.marketsTable.findMany({
    where: eq(marketsTable.status, statusFilter),
    orderBy: (market, { desc }) => desc(market.createdAt),
  });

  const summaries = await Promise.all(markets.map((market) => buildMarketSummary(market.id)));
  const filteredSummaries = summaries.filter(
    (market): market is NonNullable<typeof market> => market !== null,
  );

  filteredSummaries.sort((left, right) => {
    if (sortBy === "totalBets") {
      return right.totalMarketBets - left.totalMarketBets;
    }

    if (sortBy === "participants") {
      return right.participantCount - left.participantCount;
    }

    return Number(new Date(right.createdAt)) - Number(new Date(left.createdAt));
  });

  return paginateItems(filteredSummaries, page, 21);
}

export async function handleGetMarket({
  params,
  set,
}: {
  params: { id: number };
  set: MutableStatus;
}) {
  const market = await buildMarketSummary(params.id);

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  return market;
}

export async function handlePlaceBet({
  params,
  body,
  set,
  user,
}: {
  params: { id: number };
  body: { outcomeId: number; amount: number };
  set: MutableStatus;
  user: AuthenticatedUser;
}) {
  const marketId = params.id;
  const { outcomeId, amount } = body;
  const errors = validateBet(amount);

  if (errors.length > 0) {
    set.status = 400;
    return { errors };
  }

  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, marketId),
  });

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  if (market.status !== "active") {
    set.status = 400;
    return { error: "Market is not active" };
  }

  const outcome = await db.query.marketOutcomesTable.findFirst({
    where: and(eq(marketOutcomesTable.id, outcomeId), eq(marketOutcomesTable.marketId, marketId)),
  });

  if (!outcome) {
    set.status = 404;
    return { error: "Outcome not found" };
  }

  const numericAmount = Number(amount);
  let nextBalance = 0;

  const bet = await db.transaction(async (tx) => {
    const freshUser = await tx.query.usersTable.findFirst({
      where: eq(usersTable.id, user.id),
    });

    if (!freshUser || freshUser.balance < numericAmount) {
      return null;
    }

    nextBalance = Number((freshUser.balance - numericAmount).toFixed(2));

    const [createdBet] = await tx
      .insert(betsTable)
      .values({
        userId: user.id,
        marketId,
        outcomeId,
        amount: numericAmount,
      })
      .returning();

    await tx
      .update(usersTable)
      .set({
        balance: nextBalance,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, user.id));

    return createdBet;
  });

  if (!bet) {
    set.status = 400;
    return { error: "Insufficient balance" };
  }

  set.status = 201;
  return {
    id: bet.id,
    userId: bet.userId,
    marketId: bet.marketId,
    outcomeId: bet.outcomeId,
    amount: bet.amount,
    balance: nextBalance,
  };
}

export async function handleResolveMarket({
  params,
  body,
  set,
  user,
}: {
  params: { id: number };
  body: { outcomeId: number };
  set: MutableStatus;
  user: AuthenticatedUser | null;
}) {
  const adminError = requireAdmin(user, set);
  if (adminError) {
    return adminError;
  }

  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, params.id),
  });

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  if (market.status !== "active") {
    set.status = 400;
    return { error: "Only active markets can be resolved" };
  }

  const winningOutcome = await db.query.marketOutcomesTable.findFirst({
    where: and(
      eq(marketOutcomesTable.id, body.outcomeId),
      eq(marketOutcomesTable.marketId, params.id),
    ),
  });

  if (!winningOutcome) {
    set.status = 404;
    return { error: "Outcome not found" };
  }

  const { totalMarketBets, payouts } = await db.transaction(async (tx) => {
    const marketBets = await tx.query.betsTable.findMany({
      where: eq(betsTable.marketId, params.id),
    });

    const resolvedTotalMarketBets = marketBets.reduce((sum, bet) => sum + bet.amount, 0);
    const winningBets = marketBets.filter((bet) => bet.outcomeId === body.outcomeId);
    const resolvedPayouts = calculatePayouts(winningBets, resolvedTotalMarketBets);

    for (const payout of resolvedPayouts) {
      await tx
        .update(usersTable)
        .set({
          balance: sql`${usersTable.balance} + ${payout.payout}`,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, payout.userId));
    }

    await tx
      .update(marketsTable)
      .set({
        status: "resolved",
        resolvedOutcomeId: winningOutcome.id,
        resolvedAt: new Date(),
      })
      .where(eq(marketsTable.id, params.id));

    return {
      totalMarketBets: resolvedTotalMarketBets,
      payouts: resolvedPayouts,
    };
  });

  return {
    success: true,
    marketId: params.id,
    status: "resolved",
    winningOutcome: {
      id: winningOutcome.id,
      title: winningOutcome.title,
    },
    totalMarketBets: Number(totalMarketBets.toFixed(2)),
    winners: payouts.length,
    payouts,
  };
}

export async function handleArchiveMarket({
  params,
  set,
  user,
}: {
  params: { id: number };
  set: MutableStatus;
  user: AuthenticatedUser | null;
}) {
  const adminError = requireAdmin(user, set);
  if (adminError) {
    return adminError;
  }

  const market = await db.query.marketsTable.findFirst({
    where: eq(marketsTable.id, params.id),
  });

  if (!market) {
    set.status = 404;
    return { error: "Market not found" };
  }

  if (market.status !== "active") {
    set.status = 400;
    return { error: "Only active markets can be archived" };
  }

  const { refundedAmount, refundedBets } = await db.transaction(async (tx) => {
    const marketBets = await tx.query.betsTable.findMany({
      where: eq(betsTable.marketId, params.id),
    });

    for (const bet of marketBets) {
      await tx
        .update(usersTable)
        .set({
          balance: sql`${usersTable.balance} + ${bet.amount}`,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, bet.userId));
    }

    await tx
      .update(marketsTable)
      .set({
        status: "archived",
        resolvedAt: new Date(),
      })
      .where(eq(marketsTable.id, params.id));

    return {
      refundedBets: marketBets.length,
      refundedAmount: Number(marketBets.reduce((sum, bet) => sum + bet.amount, 0).toFixed(2)),
    };
  });

  return {
    success: true,
    marketId: params.id,
    status: "archived",
    refundedBets,
    refundedAmount,
  };
}

export async function handleGetProfile({
  query,
  user,
}: {
  query: {
    activePage?: number;
    resolvedPage?: number;
  };
  user: AuthenticatedUser;
}) {
  const activePage = query.activePage || 1;
  const resolvedPage = query.resolvedPage || 1;

  const bets = await db.query.betsTable.findMany({
    where: eq(betsTable.userId, user.id),
    with: {
      market: true,
      outcome: true,
    },
  });

  const activeBets: Array<{
    betId: number;
    marketId: number;
    marketTitle: string;
    outcomeId: number;
    outcomeTitle: string;
    amount: number;
    currentOdds: number;
    currentTotalBets: number;
    createdAt: Date;
  }> = [];
  const resolvedBets: Array<{
    betId: number;
    marketId: number;
    marketTitle: string;
    outcomeId: number;
    outcomeTitle: string;
    amount: number;
    didWin: boolean;
    winningOutcomeId: number | null;
    winningOutcomeTitle: string | null;
    createdAt: Date;
  }> = [];

  const uniqueMarketIds = [...new Set(bets.map((bet) => bet.marketId))];
  const marketSummaries = new Map<number, NonNullable<Awaited<ReturnType<typeof buildMarketSummary>>>>();

  for (const marketId of uniqueMarketIds) {
    const summary = await buildMarketSummary(marketId);
    if (summary) {
      marketSummaries.set(marketId, summary);
    }
  }

  for (const bet of bets) {
    const marketSummary = marketSummaries.get(bet.marketId);
    if (!marketSummary) {
      continue;
    }

    if (bet.market.status === "active") {
      const currentOutcome = marketSummary.outcomes.find((outcome) => outcome.id === bet.outcomeId);

      activeBets.push({
        betId: bet.id,
        marketId: bet.marketId,
        marketTitle: bet.market.title,
        outcomeId: bet.outcomeId,
        outcomeTitle: bet.outcome.title,
        amount: bet.amount,
        currentOdds: currentOutcome?.odds || 0,
        currentTotalBets: currentOutcome?.totalBets || 0,
        createdAt: bet.createdAt,
      });
      continue;
    }

    if (bet.market.status === "resolved") {
      resolvedBets.push({
        betId: bet.id,
        marketId: bet.marketId,
        marketTitle: bet.market.title,
        outcomeId: bet.outcomeId,
        outcomeTitle: bet.outcome.title,
        amount: bet.amount,
        didWin: bet.market.resolvedOutcomeId === bet.outcomeId,
        winningOutcomeId: bet.market.resolvedOutcomeId,
        winningOutcomeTitle: marketSummary.resolvedOutcome?.title || null,
        createdAt: bet.createdAt,
      });
    }
  }

  resolvedBets.sort((left, right) => right.betId - left.betId);
  activeBets.sort((left, right) => right.betId - left.betId);

  return {
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      balance: user.balance,
      hasApiKey: !!user.apiKeyHash,
      apiKeyCreatedAt: user.apiKeyCreatedAt,
    },
    activeBets: paginateItems(activeBets, activePage),
    resolvedBets: paginateItems(resolvedBets, resolvedPage),
  };
}

export async function handleGenerateApiKey({
  set,
  user,
}: {
  set: MutableStatus;
  user: AuthenticatedUser;
}) {
  const apiKey = generateApiKey();
  const apiKeyHash = hashApiKey(apiKey);

  await db
    .update(usersTable)
    .set({
      apiKeyHash,
      apiKeyCreatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, user.id));

  set.status = 201;
  return {
    apiKey,
    createdAt: new Date().toISOString(),
  };
}

export async function handleRevokeApiKey({
  user,
}: {
  user: AuthenticatedUser;
}) {
  await db
    .update(usersTable)
    .set({
      apiKeyHash: null,
      apiKeyCreatedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(usersTable.id, user.id));

  return { success: true };
}

export async function handleGetLeaderboard({ query }: { query: { page?: number } }) {
  const page = query.page || 1;
  const [users, resolvedMarkets] = await Promise.all([
    db.query.usersTable.findMany(),
    db.query.marketsTable.findMany({
      where: eq(marketsTable.status, "resolved"),
    }),
  ]);

  const winningsByUser = new Map<number, number>();

  for (const user of users) {
    winningsByUser.set(user.id, 0);
  }

  for (const market of resolvedMarkets) {
    if (!market.resolvedOutcomeId) {
      continue;
    }

    const marketBets = await db.query.betsTable.findMany({
      where: eq(betsTable.marketId, market.id),
    });

    const totalMarketBets = marketBets.reduce((sum, bet) => sum + bet.amount, 0);
    const winningBets = marketBets
      .filter((bet) => bet.outcomeId === market.resolvedOutcomeId)
      .map((bet) => ({
        id: bet.id,
        userId: bet.userId,
        amount: bet.amount,
      }));

    const payouts = calculatePayouts(winningBets, totalMarketBets);

    for (const payout of payouts) {
      winningsByUser.set(
        payout.userId,
        Number(((winningsByUser.get(payout.userId) || 0) + payout.payout).toFixed(2)),
      );
    }
  }

  const leaderboard = users
    .map((user) => ({
      userId: user.id,
      username: user.username,
      totalWinnings: winningsByUser.get(user.id) || 0,
    }))
    .sort((left, right) => right.totalWinnings - left.totalWinnings);

  return paginateItems(leaderboard, page);
}
