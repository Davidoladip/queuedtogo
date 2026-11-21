// Details shown on the public privacy policy and texting terms (/privacy, /terms).
// These must match what is submitted to Twilio for toll-free / A2P registration.
export const LEGAL = {
  /** The legal name of the business that operates QueuedToGo and is registered with Twilio. */
  operator: "ThreadToGo LLC",
  /** A public email address that reads replies (customers and carrier reviewers use it). */
  contactEmail: "hello@threadtogo.com",
  /** Optional: mailing address or city and state. */
  address: "Glen Burnie, Maryland",
  /** The name of the texting program, as registered with Twilio. */
  program: "QueuedToGo Order Updates",
  /** Texting terms (/terms). */
  updated: "October 22, 2026",
  /** Privacy policy (/privacy). */
  privacyUpdated: "November 21, 2026",
  /** Terms of Service (/terms-of-service). */
  tosUpdated: "November 21, 2026",
};

/**
 * The Terms of Service version people agree to. Change it whenever the terms change materially: everyone is asked
 * to accept the new version (and each acceptance is recorded with this version).
 */
export const TERMS_VERSION = "2026-11-21";

/** The pages (and the links to them on order forms) only appear once the real details are filled in. */
export const legalReady = () => Boolean(LEGAL.operator.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(LEGAL.contactEmail));
