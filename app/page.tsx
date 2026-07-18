import type { Metadata } from "next";
import Link from "next/link";
import { HomeFeaturedRotator } from "@/components/HomeFeaturedRotator";
import { HomeMetricsFooter } from "@/components/HomeMetricsFooter";
import { articleCategories } from "@/lib/article-categories";
import { getPublishedArticles } from "@/lib/articles";
import { getPopularVideos } from "@/lib/popular-videos";
import { fetchRunPlayBackChannelStats } from "@/lib/youtube/channel-stats";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "RunPlayBack",
  description: "Real EV reviews. Smarter purchases.",
  alternates: {
    canonical: "/",
  },
};

export default async function Home() {
  const [articles, popularVideos, channelStats] = await Promise.all([
    getPublishedArticles(),
    getPopularVideos(),
    fetchRunPlayBackChannelStats(),
  ]);
  const latestArticles = articles.slice(0, 5);
  const featuredVideos = popularVideos.slice(0, 5);

  return (
    <main className="home-page">
      <HomeFeaturedRotator
        articles={latestArticles}
        popularVideos={featuredVideos}
      />

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
