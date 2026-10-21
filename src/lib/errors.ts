type MaybeError = { message?: string; code?: string; status?: number; name?: string } | null | undefined;

const NETWORK = "We couldn't reach the sign-in service. Check your connection and try again.";

export function isNetworkError(err: MaybeError): boolean {
  return Boolean(err && (err.name === "AuthRetryableFetchError" || err.status === 0 || /fetch failed|network|ECONN|ENOTFOUND/i.test(err.message ?? "")));
}

/** Turn Supabase Auth errors into messages a customer can act on. */
export function authErrorMessage(err: MaybeError, fallback = "Something went wrong. Try again."): string {
  if (!err) return fallback;
  if (isNetworkError(err)) return NETWORK;
  switch (err.code) {
    case "invalid_credentials":
      return "That email and password don't match. Check them and try again.";
    case "email_not_confirmed":
      return "Confirm your email first. We sent you a link when you signed up.";
    case "user_already_exists":
    case "email_exists":
      return "An account with that email already exists. Sign in instead.";
    case "weak_password":
      return "Choose a stronger password: at least 8 characters, mixing letters and numbers.";
    case "same_password":
      return "Choose a password you haven't used for this account.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Wait a minute and try again.";
  }
  return err.message || fallback;
}

/** Turn Postgres / PostgREST errors from our own functions into readable messages. */
export function dbErrorMessage(err: MaybeError, fallback = "Something went wrong. Try again."): string {
  if (!err) return fallback;
  if (/fetch failed|network/i.test(err.message ?? "")) return "We couldn't reach the database. Check your connection and try again.";
  if (err.code === "23505") return "That is already taken.";
  if (err.code === "42501" || err.code === "P0001" || err.code === "P0002") return err.message || fallback;
  return fallback;
}
