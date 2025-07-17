export interface JWTPayload {
  userId: string;
  teamId: string;
  email: string;
}

export interface AuthContext {
  userId: string;
  teamId: string;
  email: string;
}

export interface AuthResult {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
}

export interface SafeUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  currentTeamId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface OAuthProfile {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  provider: string;
}
