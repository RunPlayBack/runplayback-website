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

## Rename Article Stills With Human-Friendly Filenames

The filename renamer can keep the current article-still paths stable, or it can apply a
human-approved manifest of better filenames when you already know what each frame shows.
This is the safest way to batch rename images without guessing from article text alone.

Dry run with the current automatic naming:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run rename:article-stills -- --quiet
```

Apply the automatic naming:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run rename:article-stills -- --apply --quiet
```

Apply a manifest of manual filenames:

```json
{
  "custom-72v-enduro-ebike-build-review-qs205-fardriver-etDuQ9fmzZw": [
    "controller-heatsink.jpg",
    "dashboard-screen.jpg",
    "wide-ride-shot.jpg",
    "rear-drive-chain.jpg"
  ]
}
```

Run the manifest:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run rename:article-stills -- --manifest=./article-still-filenames.json --apply --quiet
```

Let OpenAI suggest filenames from the actual still images, one article at a time:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run rename:article-stills -- --slug=custom-72v-enduro-ebike-build-review-qs205-fardriver-etDuQ9fmzZw --ai-filenames
```

Apply those AI suggestions once the preview looks right:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run rename:article-stills -- --slug=custom-72v-enduro-ebike-build-review-qs205-fardriver-etDuQ9fmzZw --ai-filenames --apply
```

The AI filename mode looks at each still image directly, combines that with the article context,
and falls back to the current slug-based naming if OpenAI does not return a usable filename.

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

## Update YouTube Descriptions

The YouTube description updater adds the matching written review link and
replaces the old `Email Me` website line with the cleaner Contact and Articles
links. It only works on videos that already have a matching published review.

Preview the next 10 matching videos without changing YouTube:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run youtube-descriptions:update -- --limit=10
```

Apply the next 10 after the preview looks right:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run youtube-descriptions:update -- --limit=10 --apply --sleep=3 --continue-on-error
```

Update one specific video:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run youtube-descriptions:update -- --video=https://youtu.be/PEQvHmDchZ4 --apply
```

Update every matching published review:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run youtube-descriptions:update -- --all --apply --sleep=3 --continue-on-error
```

Run a slower overnight update with a longer pause between batches:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run youtube-descriptions:update -- --all --apply --sleep=8 --batch-size=25 --batch-pause=300 --continue-on-error
```

Resume from a specific position after YouTube quota resets:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run youtube-descriptions:update -- --all --start=192 --apply --sleep=8 --batch-size=25 --batch-pause=300 --continue-on-error
```

The script preserves the existing YouTube title, tags, category, timestamps,
affiliate links, social links, and the rest of the description text. It skips
videos that already have the correct links. If YouTube reports that quota is
exceeded, the script stops immediately so it does not keep making failed
requests.

## Import Video Stills Into Reviews

The video still importer divides each matched YouTube video into four sections,
samples several nearby frames in each section, picks the clearest frame with
the strongest center detail, uploads it to the public `article-stills`
Supabase Storage bucket, and inserts the stills above section headings in the
matching review. Stills are not inserted below Related Reviews, Links, or video
sections.

If you want the uploaded stills to use smarter human-readable filenames, add
`--ai-filenames`. The script will extract the frames first, ask OpenAI to name
the stills from the actual images plus article context, and then upload them
with those filenames. If OpenAI fails, it falls back to the normal slug-based
names so the batch can keep moving.

This is intentionally a background script instead of a normal Admin button
because extracting frames requires `yt-dlp` and `ffmpeg`, and can take several
minutes for larger batches.

Install the local tools if needed:

```bash
brew install yt-dlp ffmpeg
```

If you already know the final filenames for a specific article, you can pass
the same manifest format used by the filename renamer so the stills are named
correctly at import time:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run import:video-stills -- --slug=custom-72v-enduro-ebike-build-review-qs205-fardriver-etDuQ9fmzZw --apply --manifest=./article-still-filenames.json
```

Preview the next five published reviews that need stills:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run import:video-stills -- --limit=5
```

Extract and import four stills for the next five reviews:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run import:video-stills -- --limit=5 --apply
```

Run all remaining reviews with pauses between each article, while continuing
past individual YouTube/yt-dlp failures:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run import:video-stills -- --all --apply --cookies-from-browser=chrome --candidates=9 --sample-window=90 --sleep=45 --continue-on-error
```

If YouTube starts pushing back, use a longer pause:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run import:video-stills -- --all --apply --cookies-from-browser=chrome --candidates=9 --sample-window=90 --sleep=120 --continue-on-error
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

Fix placement for reviews that already have video stills without downloading
the videos again:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run import:video-stills -- --all --apply --reflow-only --continue-on-error
```

The default is full-frame with no crop. If a specific video still feels too far
away, you can manually add a tighter crop:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run import:video-stills -- --slug=your-review-slug --apply --force --zoom=1.7
```

If the image feels too tight, use a softer crop or go back to full-frame:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run import:video-stills -- --slug=your-review-slug --apply --force --zoom=1.25
```

By default, each still tests five candidate frames across a 60-second window.
For videos where the rider/product moves through frame quickly, give the script
more choices:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run import:video-stills -- --slug=your-review-slug --apply --force --candidates=9 --sample-window=90
```

If YouTube asks `yt-dlp` to prove it is not a bot, let it use your signed-in
browser session:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run import:video-stills -- --video-id=your-youtube-video-id --apply --force --candidates=9 --sample-window=90 --cookies-from-browser=chrome
```

The Admin page at `/admin/video-stills` shows which reviews already have four
video stills and which still need them.

The still editor at `/admin/video-stills/[article-id]` can queue one still or
all four stills for regeneration. After queueing jobs in Admin, process them
locally:

```bash
cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run process:video-stills -- --apply --limit=10 --continue-on-error --cookies-from-browser=chrome --candidates=11 --sample-window=150
```

If a generated still is still not right, queue that same still again and rerun
the command. Manual URL replacement remains available as a fallback.

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
