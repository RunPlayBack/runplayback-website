import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/AdminLayout";
import { createClient } from "@/lib/supabase/server";
import {
  resolveStillFilenameArray,
  suggestStillFilenames,
} from "../../../../scripts/rename-article-still-filenames.mjs";
import {
  queueAllArticleVideoStillsRegeneration,
  queueArticleVideoStillRegeneration,
  renameArticleVideoStillFilenames,
  replaceArticleVideoStill,
} from "../actions";

type VideoStillEditorPageProps = {
  params: Promise<{
    id: string;
  }>;
  searchParams?: Promise<{
    error?: string;
    queued?: string;
    preview_filenames?: string;
    saved?: string;
    renamed?: string;
  }>;
};

type ArticleRow = {
  content: string;
  id: string;
  slug: string;
  title: string;
  videos:
    | {
        description: string | null;
        title: string | null;
        video_url: string | null;
        youtube_video_id: string | null;
      }
    | Array<{
        description: string | null;
        title: string | null;
        video_url: string | null;
        youtube_video_id: string | null;
      }>
    | null;
};

type VideoStill = {
  alt: string;
  url: string;
};

type FilenamePreviewItem = {
  alt: string;
  currentFilename: string;
  index: number;
  proposedFilename: string;
  url: string;
};

type VideoStillJob = {
  error_message: string | null;
  replacement_url: string | null;
  status: "done" | "failed" | "processing" | "queued";
  still_index: number;
};

const targetStillCount = 4;

function getVideoStills(content: string) {
  return [...content.matchAll(/^!\[([^\]]*)\]\((https?:\/\/[^)]+)\)$/gm)]
    .map((match) => ({
      alt: match[1],
      url: match[2],
    }))
    .filter(
      (image) =>
        image.alt.toLowerCase().startsWith("video still") ||
        image.url.includes("/article-stills/"),
    )
    .slice(0, targetStillCount);
}

function getVideo(article: ArticleRow) {
  return Array.isArray(article.videos) ? article.videos[0] : article.videos;
}

function getStatusMessage(searchParams?: {
  error?: string;
  queued?: string;
  renamed?: string;
  saved?: string;
}) {
  if (searchParams?.error) {
    return { className: "form-error", text: searchParams.error };
  }

  if (searchParams?.saved) {
    return { className: "form-success", text: "Video still saved." };
  }

  if (searchParams?.queued === "all") {
    return { className: "form-success", text: "All four stills were queued." };
  }

  if (searchParams?.queued) {
    return { className: "form-success", text: "Video still regeneration queued." };
  }

  if (searchParams?.renamed) {
    return {
      className: "form-success",
      text: `Renamed ${searchParams.renamed} still${searchParams.renamed === "1" ? "" : "s"}.`,
    };
  }

  return null;
}

function getCurrentFilename(url: string) {
  try {
    const parsed = new URL(url);
    const leaf = parsed.pathname.split("/").filter(Boolean).pop() || "";

    return decodeURIComponent(leaf);
  } catch {
    return "";
  }
}

function getLatestJobForStill(jobs: VideoStillJob[], stillIndex: number) {
  return jobs.find((job) => job.still_index === stillIndex) || null;
}

function getJobStatusText(job: VideoStillJob | null) {
  if (!job) {
    return "Ready";
  }

  if (job.status === "done") {
    return "Updated";
  }

  if (job.status === "failed") {
    return "Failed";
  }

  return job.status === "processing" ? "Processing" : "Queued";
}

function StillCard({
  articleId,
  index,
  job,
  still,
}: {
  articleId: string;
  index: number;
  job: VideoStillJob | null;
  still: VideoStill;
}) {
  const replaceStillWithId = replaceArticleVideoStill.bind(null, articleId);
  const queueStillWithId = queueArticleVideoStillRegeneration.bind(null, articleId);

  return (
    <div className="video-still-card">
      <div>
        <div className="video-still-card-header">
          <p className="meta">Still {index + 1}</p>
          <span className={`status ${job?.status || "published"}`}>
            {getJobStatusText(job)}
          </span>
        </div>
        <Image
          alt={still.alt || `Video still ${index + 1}`}
          className="video-still-preview"
          height={360}
          src={still.url}
          unoptimized
          width={640}
        />
        {job?.error_message ? (
          <p className="form-error">{job.error_message}</p>
        ) : null}
      </div>
      <form action={queueStillWithId} className="video-still-form">
        <input name="stillIndex" type="hidden" value={index} />
        <button className="button secondary-button" type="submit">
          Regenerate Still
        </button>
      </form>
      <form action={replaceStillWithId} className="video-still-form">
        <input name="stillIndex" type="hidden" value={index} />
        <label>
          Current image URL
          <input readOnly value={still.url} />
        </label>
        <label>
          Replacement image URL
          <input
            name="imageUrl"
            placeholder="Paste the new still image URL"
            required
            type="url"
          />
        </label>
        <button className="button" type="submit">
          Save Still
        </button>
      </form>
    </div>
  );
}

export default async function VideoStillEditorPage({
  params,
  searchParams,
}: VideoStillEditorPageProps) {
  const { id } = await params;
  const resolvedSearchParams = await searchParams;
  const supabase = await createClient();

  if (!supabase) {
    notFound();
  }

  const { data: article, error } = await supabase
    .from("articles")
    .select("id,title,slug,content,videos(title,description,video_url,youtube_video_id)")
    .eq("id", id)
    .single<ArticleRow>();

  if (error || !article) {
    notFound();
  }

  const { data: jobs } = await supabase
    .from("video_still_jobs")
    .select("still_index,status,replacement_url,error_message,created_at")
    .eq("article_id", article.id)
    .order("created_at", { ascending: false })
    .returns<(VideoStillJob & { created_at: string })[]>();

  const video = getVideo(article);
  let statusMessage = getStatusMessage(resolvedSearchParams);
  let previewError = "";
  const stills = getVideoStills(article.content);
  const queueAllWithId = queueAllArticleVideoStillsRegeneration.bind(null, article.id);
  const renameStillFilenamesWithId = renameArticleVideoStillFilenames.bind(
    null,
    article.id,
  );
  let filenamePreview: FilenamePreviewItem[] | null = null;

  if (resolvedSearchParams?.preview_filenames === "1" && stills.length) {
    try {
      const suggestion = await suggestStillFilenames({
        article: {
          content: article.content,
          slug: article.slug,
          title: article.title,
        },
        video: {
          description: video?.description || "",
          title: video?.title || article.title,
          video_url: video?.video_url || "",
        },
        stills: stills.map((still, index) => ({
          index,
          imageUrl: still.url,
          timestamp: "",
          context: still.alt || "",
        })),
      });
      const proposedFilenames = resolveStillFilenameArray({
        articleSlug: article.slug,
        stillCount: stills.length,
        manualEntry: null,
        aiFilenames: suggestion.filenames,
      });

      filenamePreview = stills.map((still, index) => ({
        alt: still.alt || `Video still ${index + 1}`,
        currentFilename: getCurrentFilename(still.url),
        index,
        proposedFilename: proposedFilenames[index] || "",
        url: still.url,
      }));
    } catch (filenamePreviewError) {
      previewError =
        filenamePreviewError instanceof Error
          ? filenamePreviewError.message
          : "Unable to build a filename preview.";
    }
  }

  return (
    <AdminLayout>
      <div className="admin-card">
        <p className="eyebrow">Video Stills</p>
        <h1>{article.title}</h1>
        <p>{article.slug}</p>
        <div className="video-row-actions">
          <Link className="button secondary-button" href="/admin/video-stills">
            Back to Video Stills
          </Link>
          <Link
            className="button secondary-button"
            href={`/articles/${article.slug}`}
            target="_blank"
          >
            View Review
          </Link>
          {video?.video_url ? (
            <a
              className="button secondary-button"
              href={video.video_url}
              rel="noreferrer"
              target="_blank"
            >
              Open YouTube Video
            </a>
          ) : null}
        </div>
      </div>
      {statusMessage ? (
        <p className={statusMessage.className}>{statusMessage.text}</p>
      ) : null}
      {previewError ? <p className="form-error">{previewError}</p> : null}
      <div className="admin-card">
        <h2>Replace one still at a time</h2>
        <p>
          Paste a replacement image URL into the still you want to update. The
          other stills and the review text will stay unchanged.
        </p>
        {video?.youtube_video_id ? (
          <p className="meta">YouTube video: {video.youtube_video_id}</p>
        ) : null}
        <form action={queueAllWithId} className="actions">
          <button className="button" type="submit">
            Regenerate All 4
          </button>
        </form>
        <pre className="admin-command">
{`cd "/Users/rik/Documents/RunPlayBack Website Rebuild"
npm run process:video-stills -- --apply --limit=10 --continue-on-error --cookies-from-browser=chrome --candidates=11 --sample-window=150`}
        </pre>
      </div>
      <div className="admin-card">
        <h2>Rename still filenames</h2>
        <p>
          Generate clean, descriptive filenames for the stills on this article
          before applying the changes.
        </p>
        <div className="video-row-actions">
          <form action="" method="get">
            <input name="preview_filenames" type="hidden" value="1" />
            <button className="button secondary-button" type="submit">
              Preview Filenames
            </button>
          </form>
          <form action={renameStillFilenamesWithId}>
            <button className="button" type="submit">
              Apply Filename Update
            </button>
          </form>
        </div>
        {filenamePreview ? (
          <div className="video-still-filename-preview">
            {filenamePreview.map((item) => (
              <div className="video-still-filename-row" key={`${item.url}-${item.index}`}>
                <div>
                  <p className="meta">Still {item.index + 1}</p>
                  <p>{item.alt}</p>
                </div>
                <div>
                  <strong>Current</strong>
                  <p>{item.currentFilename || "Unknown filename"}</p>
                </div>
                <div>
                  <strong>Proposed</strong>
                  <p>{item.proposedFilename || "Could not suggest a filename"}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="meta">
            Click preview to review the suggested filenames before renaming the
            files in Supabase.
          </p>
        )}
      </div>
      <div className="video-still-grid">
        {stills.length ? (
          stills.map((still, index) => (
            <StillCard
              articleId={article.id}
              index={index}
              key={`${still.url}-${index}`}
              job={getLatestJobForStill(jobs || [], index)}
              still={still}
            />
          ))
        ) : (
          <div className="admin-card">
            <h2>No video stills found</h2>
            <p>
              Run the video still importer for this review first, then come
              back here to replace individual stills.
            </p>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
