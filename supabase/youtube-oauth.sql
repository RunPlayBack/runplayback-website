create table if not exists public.youtube_oauth_tokens (
  id text primary key default 'runplayback',
  access_token text not null,
  refresh_token text,
  scope text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.youtube_oauth_tokens enable row level security;

create policy "Admins can manage YouTube OAuth tokens"
on public.youtube_oauth_tokens
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
