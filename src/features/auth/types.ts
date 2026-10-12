export type LoginRequest = { email: string; password: string };

/** Shape returned by the BFF /api/auth/login (never the raw backend response) */
export type LoginResponse = {
  access_token: string;
  access_expires_at: string;
  user_id: string;
  role: string;
};
