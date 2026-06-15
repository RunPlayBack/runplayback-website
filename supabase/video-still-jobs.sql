create table if not exists public.video_still_jobs (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  still_index integer not null check (still_index >= 0 and still_index <= 3),
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'failed')),
  replacement_url text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table public.video_still_jobs enable row level security;

drop policy if exists "Admins can manage video still jobs" on public.video_still_jobs;

create policy "Admins can manage video still jobs"
on public.video_still_jobs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create index if not exists video_still_jobs_status_created_at_idx
on public.video_still_jobs (status, created_at);

create index if not exists video_still_jobs_article_id_idx
on public.video_still_jobs (article_id);
