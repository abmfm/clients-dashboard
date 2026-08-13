import "server-only";

/**
 * Turns Google's raw API errors into something an admin can act on.
 *
 * Google's messages are accurate but written for developers - they bury the one
 * instruction that matters inside a paragraph. Each case below pulls that
 * instruction to the front.
 */
export function explainGoogleError(message: string, status?: number): string {
  const text = message ?? "";

  // The Calendar API has never been switched on for this Cloud project.
  if (/has not been used in project|accessNotConfigured|SERVICE_DISABLED/i.test(text)) {
    const link = text.match(/https:\/\/console\.[^\s]+/)?.[0];
    return (
      "The Google Calendar API is not enabled for your Google Cloud project. " +
      (link ? `Open ${link} and press ENABLE, ` : "Enable it in Google Cloud Console, ") +
      "wait about a minute, then press Test connection again."
    );
  }

  if (/insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(text)) {
    return (
      "The connection is missing permission to manage events. Remove Twelve East at " +
      "myaccount.google.com/permissions, then connect again with every permission ticked."
    );
  }

  // The refresh token was revoked, or the OAuth client changed.
  if (/invalid_grant|Token has been expired or revoked/i.test(text)) {
    return "Google has revoked this connection. Press Reconnect to authorise it again.";
  }

  if (/quota|rateLimitExceeded|userRateLimitExceeded/i.test(text)) {
    return "Google is rate limiting this account. Wait a minute and try again.";
  }

  if (status === 404 || /Not Found/i.test(text)) {
    return (
      'That calendar could not be found. Use "primary" for your main calendar, or paste ' +
      "the id of a calendar this account owns."
    );
  }

  return text || "Google returned an unexpected error.";
}
