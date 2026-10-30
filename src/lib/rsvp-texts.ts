import "server-only";

/**
 * RSVP texts are a separate use from order updates, so they stay off for every business until the
 * QueuedToGo texting campaign in Twilio covers them. Set RSVP_TEXTS=on in Vercel once it does.
 */
export const rsvpTextsApproved = () => process.env.RSVP_TEXTS === "on";
