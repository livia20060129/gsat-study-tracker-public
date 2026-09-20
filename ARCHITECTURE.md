# Public Tracker architecture

This document records the security boundary and the current migration path for the public edition.

## Runtime boundaries

```text
Browser
  └─ googleCalendarConnectionController
       ├─ reads the validated public OAuth client ID
       └─ asks the authenticated Supabase Function for an authorization URL

Supabase Edge Functions
  ├─ read server-only secrets with Deno.env.get(...)
  ├─ sign and verify OAuth state
  ├─ exchange and refresh Google tokens
  └─ read Google Calendar events with calendar.events.readonly
```

The browser is allowed to receive only `VITE_GOOGLE_CLIENT_ID`. A Google OAuth client ID is a public identifier; it is not a credential. Every other OAuth, Supabase, database, token, password, private-key, callback, return-URL, and cron value belongs to the server boundary.

## Environment-variable rules

- `scripts/validate-public-env.mjs` runs before development, build, preview, and tests.
- The validator rejects every browser variable except `VITE_GOOGLE_CLIENT_ID`.
- `.env.example` is a tracked template and must keep its placeholder value. Developers copy it to the ignored `.env.local` before entering a real client ID.
- Server settings such as `GOOGLE_CLIENT_SECRET`, `GOOGLE_STATE_SECRET`, `CALENDAR_CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ACCESS_TOKEN`, and `SUPABASE_DB_PASSWORD` must never appear in a frontend environment file.
- Supabase Edge Functions continue to read server-only values through `Deno.env.get(...)`.

## Calendar connection ownership

- `src/config/googleCalendar.ts` is the only frontend module that reads `import.meta.env.VITE_GOOGLE_CLIENT_ID` and validates its format.
- `src/application/googleCalendarConnectionController.ts` owns the connection flow, checks the returned authorization destination, and exposes configuration state to the UI.
- `src/legacy-app.ts` is only a UI adapter: it supplies the request, message, and navigation ports to the controller. It must not read Vite environment variables or embed an OAuth client ID.
- `supabase/functions/_shared/googleCalendar.ts` owns all secret-dependent OAuth operations.

## Ongoing migration rule

New or rewritten Cloud and Calendar behavior should be implemented in typed application, domain, infrastructure, or UI modules. The legacy runtime may coordinate DOM events, but authentication decisions, configuration parsing, synchronization, and data rules should not be added there.
