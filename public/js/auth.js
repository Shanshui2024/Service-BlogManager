// auth.js — Server-side GitHub OAuth login (no PKCE needed).
import { state } from "./storage.js";
import { toast } from "./ui.js";

/** Check authentication status with the server. */
export async function checkAuth() {
  try {
    const res = await fetch("/api/auth/status");
    const data = await res.json();
    state.authed = data.authenticated;
    state.ghUser = data.user || null;
  } catch {
    state.authed = false;
    state.ghUser = null;
  }
}

/** Redirect to server-side GitHub OAuth login. */
export function startLogin() {
  window.location.href = "/api/auth/login";
}

/** Log out (destroy server session). */
export async function logout() {
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch {
    // Ignore, session will expire anyway
  }
  state.authed = false;
  state.ghUser = null;
}
