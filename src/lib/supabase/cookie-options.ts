/**
 * Session cookies: httpOnly (page scripts, including any injected one, can't read the session token), Secure in
 * production (sent over HTTPS only), SameSite=Lax (not sent with cross-site form posts or embedded requests).
 * The browser never needs the token: sign-in, uploads and data all go through the server.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};
