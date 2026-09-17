alter table public.google_calendar_connections
  alter column scope set default 'https://www.googleapis.com/auth/calendar.events.readonly';

comment on column public.google_calendar_connections.scope is
  'Google OAuth scopes granted for this connection; new public-edition connections request calendar.events.readonly.';
