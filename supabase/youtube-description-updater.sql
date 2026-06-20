create table if not exists public.youtube_description_update_logs (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references public.videos(id) on delete set null,
  article_id uuid references public.articles(id) on delete set null,
  youtube_video_id text not null,
  article_slug text not null,
  old_description text,
  new_description text,
  changes text[] not null default '{}',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.youtube_description_update_logs enable row level security;

drop policy if exists "Admins can manage YouTube description update logs"
on public.youtube_description_update_logs;

create policy "Admins can manage YouTube description update logs"
on public.youtube_description_update_logs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
