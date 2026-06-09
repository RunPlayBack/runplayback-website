create table if not exists public.popular_videos (
  id uuid primary key default gen_random_uuid(),
  youtube_video_id text unique not null,
  title text not null,
  description text,
  thumbnail_url text,
  video_url text not null,
  position integer not null default 1 check (position between 1 and 8),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists popular_videos_position_idx
on public.popular_videos (position, created_at);

alter table public.popular_videos enable row level security;

drop policy if exists "Active popular videos are readable by everyone"
on public.popular_videos;

create policy "Active popular videos are readable by everyone"
on public.popular_videos
for select
using (is_active = true);

drop policy if exists "Admins can manage popular videos"
on public.popular_videos;

create policy "Admins can manage popular videos"
on public.popular_videos
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
