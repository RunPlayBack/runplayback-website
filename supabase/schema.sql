create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  youtube_video_id text unique not null,
  title text not null,
  description text,
  thumbnail_url text,
  video_url text not null,
  published_at timestamptz,
  captions_text text,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references public.videos(id) on delete set null,
  title text not null,
  slug text unique not null,
  seo_title text,
  seo_description text,
  featured_image_url text,
  author_name text not null default 'RunPlayBack',
  category_slug text,
  content text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.affiliate_links (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references public.videos(id) on delete cascade,
  article_id uuid references public.articles(id) on delete cascade,
  label text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.admins (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.youtube_oauth_tokens (
  id text primary key default 'runplayback',
  access_token text not null,
  refresh_token text,
  scope text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.admins
    where public.admins.email = auth.jwt() ->> 'email'
  );
$$;

alter table public.videos enable row level security;
alter table public.articles enable row level security;
alter table public.affiliate_links enable row level security;
alter table public.admins enable row level security;
alter table public.youtube_oauth_tokens enable row level security;
alter table public.video_still_jobs enable row level security;
alter table public.youtube_description_update_logs enable row level security;

create policy "Published articles are readable by everyone"
on public.articles
for select
using (status = 'published');

create policy "Published article links are readable by everyone"
on public.affiliate_links
for select
using (
  exists (
    select 1
    from public.articles
    where public.articles.id = public.affiliate_links.article_id
      and public.articles.status = 'published'
  )
);

create policy "Admins can read all videos"
on public.videos
for select
to authenticated
using (public.is_admin());

create policy "Admins can insert videos"
on public.videos
for insert
to authenticated
with check (public.is_admin());

create policy "Admins can update videos"
on public.videos
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can delete videos"
on public.videos
for delete
to authenticated
using (public.is_admin());

create policy "Admins can read all articles"
on public.articles
for select
to authenticated
using (public.is_admin());

create policy "Admins can insert articles"
on public.articles
for insert
to authenticated
with check (public.is_admin());

create policy "Admins can update articles"
on public.articles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can delete articles"
on public.articles
for delete
to authenticated
using (public.is_admin());

create policy "Admins can read all affiliate links"
on public.affiliate_links
for select
to authenticated
using (public.is_admin());

create policy "Admins can insert affiliate links"
on public.affiliate_links
for insert
to authenticated
with check (public.is_admin());

create policy "Admins can update affiliate links"
on public.affiliate_links
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can delete affiliate links"
on public.affiliate_links
for delete
to authenticated
using (public.is_admin());

create policy "Admins can read admins"
on public.admins
for select
to authenticated
using (public.is_admin());

create policy "Admins can manage YouTube OAuth tokens"
on public.youtube_oauth_tokens
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage video still jobs"
on public.video_still_jobs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Admins can manage YouTube description update logs"
on public.youtube_description_update_logs
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Published article videos are readable by everyone"
on public.videos
for select
using (
  exists (
    select 1
    from public.articles
    where public.articles.video_id = public.videos.id
      and public.articles.status = 'published'
  )
);
