import type { Metadata } from "next";
import Link from "next/link";
import { ArticleCard, formatArticleDate } from "@/components/ArticleCard";
import { articleCategories } from "@/lib/article-categories";
import { getPublishedArticles } from "@/lib/articles";
import { getPopularVideos } from "@/lib/popular-videos";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "RunPlayBack",
  description:
    "RunPlayBack covers electric bikes, scooters, trikes, dirt bikes, batteries, accessories, and real-world EV lifestyle reviews.",
  alternates: {
    canonical: "/",
  },
};

export default async function Home() {
  const [articles, popularVideos] = await Promise.all([
    getPublishedArticles(),
    getPopularVideos(),
  ]);
  const latestArticle = articles[0] || null;
  const latestFourArticles = articles.slice(1, 5);
  const featuredVideos = popularVideos.slice(0, 5);

  return (
    <main className="home-page">
      <section className="home-feature-grid" aria-label="Featured RunPlayBack content">
        <aside className="home-popular-card">
          <p>Featured</p>
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
              <img src={latestArticle.featuredImageUrl} alt="" />
            </Link>
            <Link
              className="home-hero-copy"
              href={`/articles/${latestArticle.slug}`}
              aria-label={`Read ${latestArticle.title}`}
            >
              <p>Latest Review</p>
              <h1>{latestArticle.title}</h1>
              {latestArticle.displayPublishedAt ? (
                <span>{formatArticleDate(latestArticle.displayPublishedAt)}</span>
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
    </main>
  );
}
