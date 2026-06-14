# RunPlayBack Article Backfill

This folder contains one-time maintenance scripts.

## Backfill YouTube Articles

`backfill-youtube-articles.mjs` imports RunPlayBack YouTube videos and creates draft articles.

Before running it, add this server-only key to `.env.local`:

```bash
SUPABASE_SERVICE_ROLE_KEY=...
```

Find it in Supabase under Project Settings → API → service_role key. Keep it private.

Optional channel hints if YouTube cannot resolve the handle:

```bash
YOUTUBE_CHANNEL_ID=...
YOUTUBE_UPLOADS_PLAYLIST_ID=...
```

Test one video without writing anything:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run backfill:articles -- --limit=1 --dry-run
```

Create drafts for the first five videos:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run backfill:articles -- --limit=5
```

Run a larger batch:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run backfill:articles -- --limit=50
```

Publish a larger batch immediately:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run backfill:articles -- --limit=50 --publish
```

Convert videos that were already saved in Supabase without calling YouTube again:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run backfill:articles -- --limit=20 --publish --saved-only
```

Fully automatic audio transcription without YouTube Data API caption quota:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run backfill:articles -- --limit=20 --publish --yt-dlp-channel --transcribe-audio --skip-captions
```

Pull SRT/VTT captions with `yt-dlp` instead of using the YouTube Data API caption endpoint:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run backfill:articles -- --limit=20 --publish --yt-dlp-channel --yt-dlp-srt --skip-captions
```

If YouTube rate-limits `yt-dlp`, wait about an hour and run a smaller, slower batch:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run backfill:articles -- --limit=10 --publish --yt-dlp-channel --yt-dlp-srt --skip-captions --yt-dlp-sleep=8
```

If the latest videos already have articles, scan farther back into the channel:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run backfill:articles -- --limit=10 --scan-limit=100 --publish --yt-dlp-channel --yt-dlp-srt --skip-captions --yt-dlp-sleep=8
```

If the first 100 scanned videos already have articles, start from an older range:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run backfill:articles -- --limit=10 --scan-start=101 --scan-limit=100 --publish --yt-dlp-channel --yt-dlp-srt --skip-captions --yt-dlp-sleep=8
```

Run overnight across the channel in repeated batches:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run backfill:all-articles -- --batch-size=10 --scan-start=101 --scan-end=800 --scan-limit=100 --yt-dlp-sleep=8
```

The overnight runner repeatedly calls the importer, skips existing articles, rechecks a range
until there are no new candidates left, then moves to the next range. If YouTube rate-limits
`yt-dlp`, it waits one hour and retries the same range. If OpenAI quota is exhausted, it stops
so the run does not waste time collecting transcripts it cannot turn into articles.

This requires local tools:

```bash
brew install yt-dlp ffmpeg
```

The script skips videos that already have an article. New articles are created as drafts
unless `--publish` is included.

YouTube Shorts are skipped automatically. The script only creates drafts for videos
that are at least 60 seconds long.

## Repair Missing Article Product Images

If published reviews are missing the inline product image after the first paragraph,
scan the published reviews without changing anything:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run repair:article-images
```

Apply the repairs:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run repair:article-images -- --apply
```

The repair skips reviews that already have a real product image, removes duplicate
YouTube thumbnail images from the body, and inserts the best product image it can find
from the saved official product links.

## Import Video Stills Into Reviews

The video still importer extracts six evenly spaced frames from each matched
YouTube video, uploads them to the public `article-stills` Supabase Storage
bucket, and inserts them throughout the matching review.

This is intentionally a background script instead of a normal Admin button
because extracting frames requires `yt-dlp` and `ffmpeg`, and can take several
minutes for larger batches.

Install the local tools if needed:

```bash
brew install yt-dlp ffmpeg
```

Preview the next five published reviews that need stills:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run import:video-stills -- --limit=5
```

Extract and import six stills for the next five reviews:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run import:video-stills -- --limit=5 --apply
```

Run one specific review by slug:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run import:video-stills -- --slug=your-review-slug --apply
```

Replace existing video stills for a review:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run import:video-stills -- --slug=your-review-slug --apply --force
```

The Admin page at `/admin/video-stills` shows which reviews already have six
video stills and which still need them.

## Backfill Article Authors

After running `supabase/article-authors.sql` in Supabase, use the thumbnail-based
author classifier to set existing published reviews to either RunPlayBack or Sully.

Preview a small batch first:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run backfill:article-authors -- --all --limit=10
```

Apply the author updates:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run backfill:article-authors -- --all --apply
```

The script uses `/Users/rik/Desktop/runplayback.jpg` and `/Users/rik/Desktop/sully.jpg`
as visual examples when they are available. New reviews default to RunPlayBack, and
the author can always be changed in the admin review editor.
