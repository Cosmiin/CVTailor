import { config } from "./config";

export type StoredSession = { accessToken: string; refreshToken: string; expiresAt: number; email: string };

export const getSession = async () => (await chrome.storage.local.get("session")).session as StoredSession | undefined;
export const clearSession = () => chrome.storage.local.remove("session");

export const signIn = async (email: string, password: string) => {
  const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || data.msg || "Sign in failed.");
  const session: StoredSession = { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000, email };
  await chrome.storage.local.set({ session });
  return session;
};

export const validAccessToken = async () => {
  let session = await getSession();
  if (!session) throw new Error("Please sign in first.");
  if (session.expiresAt - Date.now() > 60_000) return session.accessToken;
  const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: config.publishableKey, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  });
  const data = await response.json();
  if (!response.ok) { await clearSession(); throw new Error("Your session expired. Sign in again."); }
  session = { ...session, accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000 };
  await chrome.storage.local.set({ session });
  return session.accessToken;
};
