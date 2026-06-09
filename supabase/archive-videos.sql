alter table public.videos
add column if not exists archived_at timestamptz;
