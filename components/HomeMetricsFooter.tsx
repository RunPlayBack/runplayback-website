"use client";

import { useEffect, useMemo, useState } from "react";

type HomeMetric = {
  label: string;
  value: number;
};

type HomeMetricsFooterProps = {
  metrics: HomeMetric[];
};

const numberFormatter = new Intl.NumberFormat("en-US");

function formatMetricValue(value: number) {
  return numberFormatter.format(Math.round(value));
}

export function HomeMetricsFooter({ metrics }: HomeMetricsFooterProps) {
  const safeMetrics = useMemo(
    () => metrics.filter((metric) => Number.isFinite(metric.value)),
    [metrics],
  );
  const [activeIndex, setActiveIndex] = useState(0);
  const [displayValue, setDisplayValue] = useState(safeMetrics[0]?.value || 0);

  useEffect(() => {
    if (safeMetrics.length <= 1) {
      return;
    }

    const interval = window.setInterval(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % safeMetrics.length);
    }, 2600);

    return () => window.clearInterval(interval);
  }, [safeMetrics.length]);

  useEffect(() => {
    const activeMetric = safeMetrics[activeIndex];

    if (!activeMetric) {
      return;
    }

    const duration = 900;
    const startedAt = performance.now();
    let animationFrame = 0;

    const tick = (timestamp: number) => {
      const progress = Math.min((timestamp - startedAt) / duration, 1);
      const easedProgress = 1 - Math.pow(1 - progress, 3);

      setDisplayValue(activeMetric.value * easedProgress);

      if (progress < 1) {
        animationFrame = window.requestAnimationFrame(tick);
      }
    };

    setDisplayValue(0);
    animationFrame = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(animationFrame);
  }, [activeIndex, safeMetrics]);

  const activeMetric = safeMetrics[activeIndex] || safeMetrics[0];

  if (!activeMetric) {
    return null;
  }

  return (
    <section className="home-metrics-footer" aria-label="RunPlayBack metrics">
      <div className="home-metrics-copy">
        <p>By the numbers</p>
        <h2>
          RunPlayBack helps EV riders through honest reviews, real-world
          testing, and years of hands-on experience.
        </h2>
      </div>
      <div className="home-metrics-panel">
        <div className="home-metrics-active" aria-live="polite">
          <strong>{formatMetricValue(displayValue)}</strong>
          <span>{activeMetric.label}</span>
        </div>
        <div className="home-metrics-list">
          {safeMetrics.map((metric, index) => (
            <button
              aria-pressed={index === activeIndex}
              className={index === activeIndex ? "active" : ""}
              key={metric.label}
              onClick={() => setActiveIndex(index)}
              type="button"
            >
              <span>{formatMetricValue(metric.value)}</span>
              <small>{metric.label}</small>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
