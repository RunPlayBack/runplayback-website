import type { Metadata } from "next";
import Link from "next/link";
import { ArticleCard, formatArticleDate } from "@/components/ArticleCard";
import { HomeMetricsFooter } from "@/components/HomeMetricsFooter";
import { articleCategories } from "@/lib/article-categories";
import { getPublishedArticles, type PublicArticle } from "@/lib/articles";
import { getPopularVideos } from "@/lib/popular-videos";
import { fetchRunPlayBackChannelStats } from "@/lib/youtube/channel-stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "RunPlayBack",
  description: "Real EV reviews. Smarter purchases.",
  alternates: {
    canonical: "/",
  },
};

function getArticleVideoStillImages(article: PublicArticle) {
  const imageMatches = Array.from(
    article.content.matchAll(/!\[([^\]]*)]\((https?:\/\/[^)\s]+)[^)]*\)/g),
  );
  const images = imageMatches
    .filter((match) => {
      const alt = match[1]?.toLowerCase() || "";
      const imageUrl = match[2] || "";

      return alt.startsWith("video still") || imageUrl.includes("/article-stills/");
    })
    .map((match) => match[2]);
  const uniqueImages = Array.from(new Set(images));

  return uniqueImages.filter(Boolean).slice(0, 3);
}

export default async function Home() {
  const [articles, popularVideos, channelStats] = await Promise.all([
    getPublishedArticles(),
    getPopularVideos(),
    fetchRunPlayBackChannelStats(),
  ]);
  const latestArticle = articles[0] || null;
  const latestFourArticles = articles.slice(1, 5);
  const featuredVideos = popularVideos.slice(0, 5);
  const latestArticleImages = latestArticle
    ? getArticleVideoStillImages(latestArticle)
    : [];

  return (
    <main className="home-page">
      <section className="home-feature-grid" aria-label="Featured RunPlayBack content">
        <aside className="home-popular-card">
          <h2>Popular Videos</h2>
          <div className="home-popular-links">
            {featuredVideos.map((video) => (
              <Link href={`/popularvideos/${video.youtubeVideoId}`} key={video.id}>
                {video.title}
              </Link>
            ))}
          </div>
        </aside>

        {latestArticle ? (
          <>
            <Link
              className="home-hero-image"
              href={`/articles/${latestArticle.slug}`}
              aria-label={`Read ${latestArticle.title}`}
            >
              {latestArticleImages.map((imageUrl) => (
                <img src={imageUrl} alt="" key={imageUrl} />
              ))}
            </Link>
            <Link
              className="home-hero-copy"
              href={`/articles/${latestArticle.slug}`}
              aria-label={`Read ${latestArticle.title}`}
            >
              <p>Latest Review</p>
              <h1>{latestArticle.title}</h1>
              <span className="home-hero-author">
                Written by <strong>{latestArticle.authorName}</strong>
              </span>
              {latestArticle.displayPublishedAt ? (
                <span className="home-hero-date">
                  {formatArticleDate(latestArticle.displayPublishedAt)}
                </span>
              ) : null}
              <small>{latestArticle.seoDescription}</small>
            </Link>
          </>
        ) : (
          <div className="home-hero-copy home-hero-copy-empty">
            <p>Latest Review</p>
            <h1>RunPlayBack reviews are coming soon.</h1>
          </div>
        )}
      </section>

      {latestFourArticles.length ? (
        <section className="home-latest-row" aria-label="Latest reviews">
          {latestFourArticles.map((article) => (
            <ArticleCard article={article} key={article.id} />
          ))}
        </section>
      ) : null}

      <section className="home-topic-section" aria-label="Explore by popular topics">
        <div>
          <p>Explore by</p>
          <h2>Popular Topics</h2>
        </div>
        <div className="home-topic-links">
          {articleCategories.map((category) => (
            <Link href={`/articles/categories/${category.slug}`} key={category.slug}>
              {category.label}
              <span aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </section>
      <HomeMetricsFooter
        metrics={[
          {
            label: "Subscribers",
            value: channelStats.subscriberCount || 61_000,
          },
          {
            label: "Views",
            value: channelStats.viewCount || 10_200_000,
          },
          {
            label: "Reviews",
            value: articles.length,
          },
        ]}
      />
    </main>
  );
}
