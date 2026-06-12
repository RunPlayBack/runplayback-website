alter table public.articles
add column if not exists author_name text not null default 'RunPlayBack';

update public.articles
set author_name = 'RunPlayBack'
where author_name is null or btrim(author_name) = '';
