-- Store the public OAuth client ID with each Calendar connection.
-- The client secret and refresh/access tokens remain server-side only.

alter table public.google_calendar_connections
  add column if not exists client_id text;

comment on column public.google_calendar_connections.client_id is
  'Public Google OAuth Web client ID used for this connection; safe to identify the OAuth app.';
