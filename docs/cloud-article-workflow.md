# RunPlayBack Cloud Article Workflow

## Goal

Create a cloud-based workflow where every RunPlayBack YouTube video can become a reviewed, SEO-friendly article on runplayback.com.

## Recommended Stack

- Next.js on Vercel for the public website and admin dashboard.
- Supabase for authentication, videos, article drafts, published articles, and affiliate links.
- YouTube Data API for video title, description, thumbnail, publish date, and video URL.
- Caption import for YouTube captions when available.
- Codex for code changes, content workflow improvements, and later automation support.

## Workflow

1. Admin imports a YouTube video from youtube.com/runplayback.
2. The app stores video metadata in Supabase.
3. The app imports captions when available.
4. The app extracts affiliate links and regular hyperlinks from the YouTube description.
5. The app creates an article draft in the RPB Writing Style.
6. Admin reviews the draft, fixes typos, edits content, and checks links.
7. Admin publishes the article.
8. Published articles appear on `/articles` and individual `/articles/[slug]` pages.
9. The sitemap updates so Google can discover the new article.

## RPB Writing Style

- Friendly
- Casual
- Educational
- No corporate jargon
- No hype language
- No clickbait
- Honest observations
- Real-world riding experience
- Technical information explained simply

## Article Structure

1. Introduction
2. First Impressions
3. Technical Specifications
4. Real World Experience
5. Pros
6. Cons
7. Final Thoughts
8. Video
9. Links

## SEO Notes

- Each article should have a unique slug.
- Each article should have an SEO title and SEO description.
- Each article should embed the original YouTube video.
- Each article should include all relevant links from the YouTube description.
- Published article pages should use Article structured data.
- The site should submit `/sitemap.xml` to Google Search Console.
- YouTube video URLs should be cross-linked from the article pages.
- YouTube descriptions can eventually link back to the matching article page.

## Domain And Hosting

- Keep runplayback.com ownership in GoDaddy.
- Deploy the Next.js app to Vercel.
- Add runplayback.com to the Vercel project.
- Update GoDaddy DNS records to point to Vercel when ready.
- Cancel Squarespace only after the Vercel version is deployed, tested, indexed, and the domain has fully moved.

## Next Build Steps

1. Create a Supabase project.
2. Run the schema in `supabase/schema.sql`.
3. Add Supabase environment variables to Vercel and local `.env.local`.
4. Connect admin login to Supabase Auth.
5. Replace placeholder articles/videos with Supabase reads.
6. Add YouTube import tooling.
7. Add caption import and link extraction.
8. Add article draft generation.
9. Add publish/unpublish behavior.

## Supabase Setup Checklist

1. Create a new Supabase project.
2. Open the Supabase SQL Editor.
3. Run `supabase/schema.sql`.
4. Go to Authentication and create an admin user with email/password.
5. Insert the same admin email into `public.admins`.
6. Copy the project URL and anon/publishable key into `.env.local`.
7. Add the same environment variables in Vercel.

Local `.env.local` values:

```txt
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION=optional-google-search-console-token
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-5.2
YOUTUBE_API_KEY=your-youtube-data-api-key
GOOGLE_OAUTH_CLIENT_ID=your-google-oauth-client-id
GOOGLE_OAUTH_CLIENT_SECRET=your-google-oauth-client-secret
```

Admin email insert example:

```sql
insert into public.admins (email)
values ('your-admin-email@example.com')
on conflict (email) do nothing;
```

## Current Code Status

- Supabase packages are installed.
- Browser and server Supabase clients are added.
- Admin routes are protected when Supabase environment variables are present.
- `/admin/login` signs in with Supabase email/password.
- Admin sidebar includes sign out.
- `/admin/videos` can manually save YouTube videos.
- `/admin/videos` can import YouTube title, description, thumbnail, publish date, and links when `YOUTUBE_API_KEY` is present.
- `/admin/videos` can connect YouTube OAuth and import official caption tracks for videos the authorized account can access.
- `/admin/videos` can generate an OpenAI draft article from stored video fields.
- Placeholder article and video data still powers the public site until Supabase reads are added.

## OpenAI Draft Generation

The draft generator lives in `lib/openai/article-generator.ts`.

It uses the OpenAI Responses API from a server action, so `OPENAI_API_KEY` stays on the server and is not exposed to the browser.

Drafts are instructed to follow `RUNPLAYBACK_ARTICLE_STYLE.md`: polished review style, strong editorial hook, short paragraphs, practical ride experience, no numbered outline headings, and no spec-sheet language.

Current source fields:

- Video title
- Video URL
- Thumbnail URL
- YouTube description
- Captions text

Current limitation:

- YouTube API import is not connected yet, so titles, descriptions, links, and captions must be stored manually or added by a future import step.

Recommended next step:

- Connect the YouTube API so imported videos automatically fill title, description, thumbnail, publish date, and captions before OpenAI generates the draft.

## YouTube API Import

The metadata importer lives in `lib/youtube/metadata.ts`.

It uses the YouTube Data API `videos.list` endpoint with `part=snippet` and a server-side `YOUTUBE_API_KEY`.

Imported fields:

- Title
- Description
- Publish date
- Best available thumbnail
- Video URL
- Description links into `affiliate_links`

Current limitation:

- Official caption import requires Google OAuth with the YouTube account that owns or can manage the video. It may not work for arbitrary public videos.

Current fallback:

- `/admin/videos` includes a transcript/captions textarea.
- Pasted transcript text is saved to `videos.captions_text`.
- OpenAI draft generation uses that transcript when creating article drafts.

## YouTube OAuth Captions Setup

Create an OAuth client in Google Cloud:

1. Go to Google Cloud Console.
2. Open the same project used for YouTube Data API v3.
3. Go to APIs & Services -> Credentials.
4. Create an OAuth client ID.
5. Application type: Web application.
6. Add this authorized redirect URI for local development:

```txt
http://localhost:3000/admin/youtube/callback
```

7. Add the production redirect URI later:

```txt
https://runplayback.com/admin/youtube/callback
```

8. Add `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` to `.env.local`.
9. Run `supabase/youtube-oauth.sql` if the main schema was already created before the OAuth token table was added.
10. Restart the app and click `Connect YouTube Captions` in `/admin/videos`.
