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

The public edition now shares the client improvements through v171.6.141 for persistent auth storage, session restoration, pending sync management, reversible local baseline compaction, math range preservation, vocabulary stars, local document exports and runtime performance. The early page frame and `site-shell.ts` provide common desktop rails, mobile touch gestures and page transitions; record forms keep their existing nodes and save handlers.

Public-specific rules remain in place: `materialSelection.ts` filters the manual material choices, the material page keeps two panels and an external subject switch, and only fresh complete Calendar responses may reconcile schedules. `calendarScheduleContinuity.ts` supplies account/request invalidation, but the public UI never restores its schedule snapshots. Valid GSAT/GAST identifiers remain an admission rule rather than a built-in-material whitelist.

New or rewritten Cloud and Calendar behavior should be implemented in typed application, domain, infrastructure, or UI modules. The legacy runtime may coordinate DOM events, but authentication decisions, configuration parsing, synchronization, and data rules should not be added there.

## Runtime performance boundaries

- `studyPartAnnotation.ts` first excludes strings without a slash, then reuses the existing fraction rules. Dates, fullwidth input and valid parts retain the same meaning.
- `textOrder.ts` shares two `Intl.Collator` instances with the original Traditional Chinese and numeric ordering. It does not cache record-dependent classifications.
- Batch skipping checks the active account prefix for each affected date, then reloads and merges that date before saving. It does not decode unrelated history just to check the account.
- `keyedTodoList.ts` mounts first-time lists using `DocumentFragment` and reorders existing nodes with a cursor, retaining input focus and timer controls.
- Vocabulary edits clone only the entry's source dates. Each source still uses the existing fresh-read and conflict-safe save path.
- `materialProgress.ts` unions coverage once per material, then intersects those sorted non-overlapping ranges with each chapter. Public social subjects, additional books, catalog matching and all page maps stay in the public module.
- `npm run benchmark:runtime` uses a fixed in-memory fixture only; it never reads real accounts or browser storage. Browser tests enforce operation-count bounds rather than hardware-dependent timing limits.

## Explicit Google Cloud Translation (public.53)

- Browser editor actions use a lazily loaded Supabase session and send only the selected English to the authenticated cloud-translate function. Guests never call it. Account identity is checked before the request and after the response; confirmation rechecks the active local account scope before the existing merge and save path.
- The function verifies the access token with auth.getUser; anonymous users are rejected. It reads GOOGLE_TRANSLATION_API_KEY server-side and calls Basic v2 with a secret header, fixed en/zh-TW languages, text format and NMT. Calendar OAuth scopes are unchanged.
- A bounded protocol and 16 KiB streamed body limit reject invalid payloads. PostgreSQL reserves per-user and global UTC-day counts atomically under a transaction lock. RLS and explicit grants allow only service_role to reserve or access counters. A failed quota check stops before Google.
- Quotas default to 2,000 characters/request, 20,000 characters and 100 requests/user/day, and 200,000 characters and 2,000 requests/site/day. Server secrets can set either character cap to zero. Attempts remain reserved after provider failures; the table contains no raw text, purges entries older than 35 days on subsequent requests, and cascades per-user deletion.
- Confirmation appends via the existing source-date edit and three-way merge path. cloudTranslationSources stays separate from dictionarySources; no automatic POS or level is inferred. Source metadata survives codec, sync and export. Official Google attribution is displayed in previews, saved cards, translated Word/PDF/print exports; blank practice exports contain no answers or translation metadata.
- Preview instances are reused through unrelated renders, preventing discarded paid results. Closing, renaming, account/context changes or removal dispose pending requests. HTTP errors expose only safe local messages.
- Deployment details and real-key verification steps are in GOOGLE_TRANSLATION_SETUP.md. No new browser environment variable, npm dependency, Calendar consent change, or secret in GitHub is needed.
