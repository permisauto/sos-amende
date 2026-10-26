import * as Sentry from "@sentry/nextjs";

export function register() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    environment: process.env.NODE_ENV ?? "development",
    release: process.env.npm_package_version ?? "0.1.0",
    ignoreErrors: [
      "AbortError",
      "Aborted",
      "Request aborted",
      "The operation was aborted",
      "P1001",
      "P1008",
      "P1017",
      "rate limit",
      "Too many requests",
    ],
    initialScope: {
      tags: {
        component: "sos-amende",
        team: "legaltech",
      },
    },
    beforeSend(event, _hint) {
      if (!process.env.SENTRY_DSN) return null;

      if (event.request) {
        const sensitiveHeaders = ["authorization", "cookie", "x-csrf-token", "x-health-secret"];
        if (event.request.headers) {
          for (const h of sensitiveHeaders) {
            if (event.request.headers[h]) {
              event.request.headers[h] = "[REDACTED]";
            }
          }
        }
        if (event.request.data) {
          event.request.data = "[REDACTED]";
        }
      }

      return event;
    },
  });
}

export const onRequestError = Sentry.captureRequestError;