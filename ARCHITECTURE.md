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

The public edition now shares the client improvements through v171.6.148 for persistent auth storage, session restoration, pending sync management, reversible local baseline compaction, math range preservation, vocabulary stars, local document exports and runtime performance. The early page frame and `site-shell.ts` provide common desktop rails, mobile touch gestures and page transitions; record forms keep their existing nodes and save handlers.

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

## Shared completion and read-only history

- `rangeCompletion.ts` unions completed page, Unit or round ranges and marks only fully covered required plans for the same subject/material/edition/volume. Public social subjects and generic Calendar materials participate independently. Automatic marks never become evidence for further automatic marks; removing evidence retracts automatic marks, and manual unchecking opts out. Time, correction fields and source records retain their values.
- `synchronizeRangeCompletion.ts` writes through the existing fresh-read, local-dirty and conflict-safe save path. Read-only frozen date caches are invalidated by repository writes, storage events and window focus; cached snapshots are never transaction baselines.
- Long-term todo editors mount on first expansion; unchanged vocabulary rows and group nodes are retained. CEEC metadata uses a compact index and translations parse on demand, with a bounded 256-entry cache. ECDICT requests return their own loaded shard even after another shard is evicted.
- Pending local vocabulary lookups resume after navigation. Focus-exit/change deduplication and transient account/date/word-scoped feedback protect user input; only deliberately edited pending words are enriched. Public paid Google requests remain explicit button actions.

## Explicit Google Cloud Translation (public.56)

- Each vocabulary editor has a Google translation button, including phrases and sentences. The official badge is concentrated at the vocabulary page header; translated PDF/DOCX/print exports retain attribution. Blank practice exports contain no answers or translation metadata. Oxford/Cambridge link preferences persist without calling their APIs; the Cambridge UI label is 劍橋英漢辭典.
- Only selected English is sent through the public authenticated `cloud-translate` endpoint. Browser and server caches are bounded to 256 successful results, scoped to the verified account and exact normalized text. In-flight requests are deduplicated; each browser subscriber can cancel independently. Authentication still runs before cache reuse, and account/context changes cannot apply stale results.
- Server `auth.getUser` rejects missing, invalid and anonymous sessions. The API key stays server-side; only Basic v2 en/zh-TW text NMT is used. Body/input limits and fail-closed quota checks remain. The Calendar scope and public project binding are unchanged.
- The public allowance is **5,000 Unicode characters** per account/month, resetting at midnight Asia/Taipei on the first day; each request is at most 2,000 characters. The existing global UTC-day cap remains. Provider failures still consume reservations. A new private service-only receipt table records verified account ID, a server-generated request UUID, character count and validated quota snapshot, with no raw text or translations. Retrying a quota RPC reuses the UUID; both the counter and receipt commit atomically. Old receipts are cleaned after 35 days; deleting an account cascades its receipts and counters.
- `reserve_cloud_translation_request` is SECURITY INVOKER with empty search_path and explicit service_role-only execution; browser roles cannot access counters or receipts. The existing monthly reservation function remains for compatibility. The new RPC returns safe used/remaining/reset metadata. Real SQL behavior is tested with dev-only PGlite.
- A single checked POS carries over. With no tags, optional exact-spelling local CEEC/ECDICT labels can suggest one POS; multiple labels require a user choice. Google never infers POS or Level. Local/Google previews invalidate older results when the user switches source; edits save only after confirmation. Public final-unclassified deletion and separate cloudTranslationSources metadata are preserved.
- Deploy the new forward migration before the updated function and website using the existing release workflow; no new Secrets, OAuth scopes or frontend environment variables are required. CI retains the pinned npm Deno installer from public.55.
