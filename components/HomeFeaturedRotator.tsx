"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArticleCard, formatArticleDate } from "@/components/ArticleCard";
import type { PublicArticle } from "@/lib/articles";
import type { PopularVideo } from "@/lib/popular-videos";

type HomeFeaturedRotatorProps = {
  articles: PublicArticle[];
  popularVideos: PopularVideo[];
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

export function HomeFeaturedRotator({
  articles,
  popularVideos,
}: HomeFeaturedRotatorProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isTabVisible, setIsTabVisible] = useState(true);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const featuredArticle = articles[activeIndex] || articles[0] || null;
  const supportingArticles = useMemo(
    () => articles.filter((_, index) => index !== activeIndex).slice(0, 4),
    [activeIndex, articles],
  );
  const featuredArticleImages = featuredArticle
    ? getArticleVideoStillImages(featuredArticle)
    : [];

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleMotionChange = () => setPrefersReducedMotion(mediaQuery.matches);

    handleMotionChange();
    mediaQuery.addEventListener("change", handleMotionChange);

    return () => mediaQuery.removeEventListener("change", handleMotionChange);
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => setIsTabVisible(!document.hidden);

    handleVisibilityChange();
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (
      articles.length < 2 ||
      isPaused ||
      !isTabVisible ||
      prefersReducedMotion
    ) {
      return;
    }

    const rotationTimer = window.setTimeout(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % articles.length);
    }, 10_000);

    return () => window.clearTimeout(rotationTimer);
  }, [articles.length, activeIndex, isPaused, isTabVisible, prefersReducedMotion]);

  function pauseRotation() {
    setIsPaused(true);
  }

  function resumeRotation() {
    setIsPaused(false);
  }

  return (
    <>
      <section className="home-feature-grid" aria-label="Featured RunPlayBack content">
        <aside className="home-popular-card">
          <h2>Popular Videos</h2>
          <div className="home-popular-links">
            {popularVideos.map((video) => (
              <Link href={`/popularvideos/${video.youtubeVideoId}`} key={video.id}>
                {video.title}
              </Link>
            ))}
          </div>
        </aside>

        {featuredArticle ? (
          <>
            <Link
              className="home-hero-image home-feature-transition"
              href={`/articles/${featuredArticle.slug}`}
              aria-label={`Read ${featuredArticle.title}`}
              key={`${featuredArticle.id}-images`}
              onBlur={resumeRotation}
              onFocus={pauseRotation}
              onMouseEnter={pauseRotation}
              onMouseLeave={resumeRotation}
            >
              {featuredArticleImages.map((imageUrl, index) => (
                <img
                  src={imageUrl}
                  alt={`${featuredArticle.title} review image ${index + 1}`}
                  key={imageUrl}
                />
              ))}
            </Link>
            <Link
              className="home-hero-copy home-feature-transition"
              href={`/articles/${featuredArticle.slug}`}
              aria-label={`Read ${featuredArticle.title}`}
              key={`${featuredArticle.id}-copy`}
              onBlur={resumeRotation}
              onFocus={pauseRotation}
              onMouseEnter={pauseRotation}
              onMouseLeave={resumeRotation}
            >
              <p>Latest Review</p>
              <h1>{featuredArticle.title}</h1>
              <span className="home-hero-author">
                Written by <strong>{featuredArticle.authorName}</strong>
              </span>
              {featuredArticle.displayPublishedAt ? (
                <span className="home-hero-date">
                  {formatArticleDate(featuredArticle.displayPublishedAt)}
                </span>
              ) : null}
              <small>{featuredArticle.seoDescription}</small>
            </Link>
          </>
        ) : (
          <div className="home-hero-copy home-hero-copy-empty">
            <p>Latest Review</p>
            <h1>RunPlayBack reviews are coming soon.</h1>
          </div>
        )}
      </section>

      {supportingArticles.length ? (
        <section
          className="home-latest-row"
          aria-label="Latest reviews"
          onBlur={resumeRotation}
          onFocus={pauseRotation}
          onMouseEnter={pauseRotation}
          onMouseLeave={resumeRotation}
        >
          {supportingArticles.map((article) => (
            <ArticleCard article={article} key={article.id} />
          ))}
        </section>
      ) : null}
    </>
  );
}
