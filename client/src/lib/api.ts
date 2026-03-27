const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:4001";

// Types
export interface Market {
  id: number;
  title: string;
  description?: string;
  status: "active" | "resolved" | "archived";
  createdAt: string;
  creator?: string;
  outcomes: MarketOutcome[];
  totalMarketBets: number;
  participantCount: number;
  resolvedOutcome?: {
    id: number;
    title: string;
  } | null;
  resolvedAt?: string | null;
}

export interface MarketOutcome {
  id: number;
  title: string;
  odds: number;
  totalBets: number;
}

export interface User {
  id: number;
  username: string;
  email: string;
  token: string;
  role?: "user" | "admin";
  balance?: number;
}

export interface Bet {
  id: number;
  userId: number;
  marketId: number;
  outcomeId: number;
  amount: number;
  createdAt: string;
  balance?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
}

export interface ProfileActiveBet {
  betId: number;
  marketId: number;
  marketTitle: string;
  outcomeId: number;
  outcomeTitle: string;
  amount: number;
  currentOdds: number;
  currentTotalBets: number;
  createdAt: string;
}

export interface ProfileResolvedBet {
  betId: number;
  marketId: number;
  marketTitle: string;
  outcomeId: number;
  outcomeTitle: string;
  amount: number;
  didWin: boolean;
  winningOutcomeId: number | null;
  winningOutcomeTitle: string | null;
  createdAt: string;
}

export interface ProfileResponse {
  user: {
    id: number;
    username: string;
    email: string;
    role: "user" | "admin";
    balance: number;
    hasApiKey: boolean;
    apiKeyCreatedAt: string | null;
  };
  activeBets: PaginatedResponse<ProfileActiveBet>;
  resolvedBets: PaginatedResponse<ProfileResolvedBet>;
}

export interface LeaderboardEntry {
  userId: number;
  username: string;
  totalWinnings: number;
}

export interface ApiKeyResponse {
  apiKey: string;
  createdAt: string;
}

// API Client
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getAuthHeader() {
    const token = localStorage.getItem("auth_token");
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  }

  private async request(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      "Content-Type": "application/json",
      ...this.getAuthHeader(),
      ...options.headers,
    };

    const response = await fetch(url, {
      ...options,
      headers,
    });

    const data = await response.json();

    if (!response.ok) {
      // If there are validation errors, throw them
      if (data.errors && Array.isArray(data.errors)) {
        const errorMessage = data.errors.map((e: any) => `${e.field}: ${e.message}`).join(", ");
        throw new Error(errorMessage);
      }
      throw new Error(data.error || `API Error: ${response.status}`);
    }

    return data ?? {};
  }

  // Auth endpoints
  async register(username: string, email: string, password: string): Promise<User> {
    return this.request("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, email, password }),
    });
  }

  async login(email: string, password: string): Promise<User> {
    return this.request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
  }

  // Markets endpoints
  async listMarkets(
    status: "active" | "resolved" | "archived" = "active",
    sortBy: "createdAt" | "totalBets" | "participants" = "createdAt",
    page = 1,
  ): Promise<PaginatedResponse<Market>> {
    return this.request(`/api/markets?status=${status}&sortBy=${sortBy}&page=${page}`);
  }

  async getMarket(id: number): Promise<Market> {
    return this.request(`/api/markets/${id}`);
  }

  async createMarket(title: string, description: string, outcomes: string[]): Promise<Market> {
    return this.request("/api/markets", {
      method: "POST",
      body: JSON.stringify({ title, description, outcomes }),
    });
  }

  // Bets endpoints
  async placeBet(marketId: number, outcomeId: number, amount: number): Promise<Bet> {
    return this.request(`/api/markets/${marketId}/bets`, {
      method: "POST",
      body: JSON.stringify({ outcomeId, amount }),
    });
  }

  async resolveMarket(marketId: number, outcomeId: number) {
    return this.request(`/api/markets/${marketId}/resolve`, {
      method: "POST",
      body: JSON.stringify({ outcomeId }),
    });
  }

  async archiveMarket(marketId: number) {
    return this.request(`/api/markets/${marketId}/archive`, {
      method: "POST",
    });
  }

  async getProfile(activePage = 1, resolvedPage = 1): Promise<ProfileResponse> {
    return this.request(`/api/users/me?activePage=${activePage}&resolvedPage=${resolvedPage}`);
  }

  async getLeaderboard(page = 1): Promise<PaginatedResponse<LeaderboardEntry>> {
    return this.request(`/api/leaderboard?page=${page}`);
  }

  async generateApiKey(): Promise<ApiKeyResponse> {
    return this.request("/api/users/me/api-key", {
      method: "POST",
    });
  }

  async revokeApiKey(): Promise<{ success: boolean }> {
    return this.request("/api/users/me/api-key", {
      method: "DELETE",
    });
  }
}

export const api = new ApiClient(API_BASE_URL);
