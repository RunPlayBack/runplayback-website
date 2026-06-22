alter table public.articles
add column if not exists article_type text not null default 'review'
check (article_type in ('review', 'best_of', 'versus'));

create table if not exists public.article_sources (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  source_article_id uuid not null references public.articles(id) on delete cascade,
  sort_order integer not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.generated_article_images (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  source_article_id uuid references public.articles(id) on delete set null,
  image_url text not null,
  alt_text text,
  caption text,
  placement text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.article_sources enable row level security;
alter table public.generated_article_images enable row level security;

drop policy if exists "Published article sources are readable by everyone"
on public.article_sources;

create policy "Published article sources are readable by everyone"
on public.article_sources
for select
using (
  exists (
    select 1
    from public.articles
    where public.articles.id = public.article_sources.article_id
      and public.articles.status = 'published'
  )
);

drop policy if exists "Admins can manage article sources"
on public.article_sources;

create policy "Admins can manage article sources"
on public.article_sources
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Published generated article images are readable by everyone"
on public.generated_article_images;

create policy "Published generated article images are readable by everyone"
on public.generated_article_images
for select
using (
  exists (
    select 1
    from public.articles
    where public.articles.id = public.generated_article_images.article_id
      and public.articles.status = 'published'
  )
);

drop policy if exists "Admins can manage generated article images"
on public.generated_article_images;

create policy "Admins can manage generated article images"
on public.generated_article_images
for all
to authenticated
using (public.is_admin())
with check (public.is_admin());
