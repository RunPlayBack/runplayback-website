import type { PublicArticle } from "@/lib/articles";

export type ArticleCategory = {
  description: string;
  label: string;
  slug: string;
  keywords: string[];
};

export const articleCategories: ArticleCategory[] = [
  {
    description:
      "Electric bike reviews, ride tests, moped-style e-bikes, folding e-bikes, fat tire builds, and commuter EVs.",
    label: "Electric Bikes",
    slug: "electric-bikes",
    keywords: [
      "ebike",
      "e-bike",
      "electric bike",
      "folding bike",
      "fat tire",
      "moped-style",
      "moped style",
      "commuter",
      "cargo ebike",
      "lectric",
      "urtopia",
      "meelod",
      "freego",
      "yadea",
      "luckeep",
    ],
  },
  {
    description:
      "Electric scooter reviews, seated scooter tests, stand-up scooters, and compact urban EV rides.",
    label: "Electric Scooters",
    slug: "electric-scooters",
    keywords: ["scooter", "electric scooter", "seated scooter", "kick scooter"],
  },
  {
    description:
      "Electric trike reviews focused on cargo space, stability, folding frames, comfort, and utility.",
    label: "Electric Trikes",
    slug: "electric-trikes",
    keywords: ["trike", "electric trike", "three wheel", "3 wheel", "tk2", "creek pro"],
  },
  {
    description:
      "Mini electric dirt bike reviews, Surron-style builds, off-road testing, and high-power compact EVs.",
    label: "Mini Electric Dirt Bikes",
    slug: "mini-electric-dirt-bikes",
    keywords: [
      "dirt bike",
      "mini dirt",
      "mini bike",
      "surron",
      "sur ron",
      "talaria",
      "rawrr",
      "eride",
      "72v",
      "off-road",
      "off road",
      "zonveer",
      "windone",
      "happyrun",
    ],
  },
  {
    description:
      "Battery reviews, range tests, lithium upgrades, safety notes, and high-voltage EV battery builds.",
    label: "Batteries",
    slug: "batteries",
    keywords: ["battery", "batteries", "lithium battery", "range test", "amp hour"],
  },
  {
    description:
      "Charging cabinets, chargers, storage setups, battery safety, and practical EV charging solutions.",
    label: "Charging Solutions",
    slug: "charging-solutions",
    keywords: ["charging", "charger", "charging cabinet", "cabinet", "storage", "yolin"],
  },
  {
    description:
      "Controller upgrades, motor upgrades, performance tuning, brake upgrades, and drivetrain improvements.",
    label: "Controllers & Upgrades",
    slug: "controllers-upgrades",
    keywords: [
      "controller",
      "torp",
      "motor",
      "upgrade",
      "upgrades",
      "brake",
      "brakes",
      "hydraulic",
      "tire",
      "tires",
      "hub",
      "install",
    ],
  },
  {
    description:
      "Riding gear, helmets, gloves, mirrors, bags, pumps, phone mounts, alarms, and EV lifestyle accessories.",
    label: "Accessories",
    slug: "accessories",
    keywords: [
      "accessory",
      "accessories",
      "helmet",
      "gloves",
      "mirror",
      "bag",
      "pump",
      "phone mount",
      "alarm",
      "gear",
      "riding gear",
      "beyond riders",
    ],
  },
];

function normalizeCategoryText(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ");
}

function getCategorySourceText(article: Pick<PublicArticle, "seoDescription" | "title" | "video">) {
  const titleText = normalizeCategoryText(`${article.title} ${article.video?.title || ""}`);
  const summaryText = normalizeCategoryText(`${titleText} ${article.seoDescription}`);

  return {
    summaryText,
    titleText,
  };
}

function includesAny(text: string, phrases: string[]) {
  return phrases.some((phrase) => text.includes(phrase));
}

function keywordScore(text: string, keywords: string[]) {
  return keywords.reduce(
    (total, keyword) => total + (text.includes(keyword.toLowerCase()) ? 1 : 0),
    0,
  );
}

function getArticleCategoryScore(article: PublicArticle, category: ArticleCategory) {
  const { summaryText, titleText } = getCategorySourceText(article);

  switch (category.slug) {
    case "batteries": {
      const hasBatteryFocus = includesAny(titleText, [
        "battery",
        "batteries",
        "battery upgrade",
        "battery build",
        "battery breakdown",
        "lithium-ion battery",
        "lithium ion battery",
        "r-spec",
        "range test",
      ]);

      if (!hasBatteryFocus) {
        return 0;
      }

      return 14 + keywordScore(summaryText, category.keywords);
    }

    case "charging-solutions": {
      const hasChargingFocus = includesAny(titleText, [
        "charging",
        "charger",
        "charging cabinet",
        "battery cabinet",
        "storage cabinet",
        "yolin",
      ]);

      if (!hasChargingFocus) {
        return 0;
      }

      return 16 + keywordScore(summaryText, category.keywords);
    }

    case "controllers-upgrades": {
      const hasUpgradeFocus = includesAny(titleText, [
        "controller",
        "torp",
        "motor",
        "upgrade",
        "brake",
        "brakes",
        "hydraulic",
        "tire",
        "tires",
        "hub",
        "install",
      ]);

      if (!hasUpgradeFocus) {
        return 0;
      }

      return 10 + keywordScore(summaryText, category.keywords);
    }

    default:
      return keywordScore(titleText, category.keywords) * 4 + keywordScore(summaryText, category.keywords);
  }
}

function getArticleCategoryMatch(article: PublicArticle) {
  const scoredCategories = articleCategories
    .map((category) => ({
      category,
      score: getArticleCategoryScore(article, category),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return articleCategories.indexOf(a.category) - articleCategories.indexOf(b.category);
    });

  return scoredCategories[0] || null;
}

export function getArticleCategory(article: PublicArticle) {
  return getArticleCategoryMatch(article)?.category || articleCategories[0];
}

export function getArticleCategoryBySlug(slug: string) {
  return articleCategories.find((category) => category.slug === slug) || null;
}

export function getArticlesForCategory(articles: PublicArticle[], categorySlug: string) {
  return articles.filter((article) => getArticleCategoryMatch(article)?.category.slug === categorySlug);
}
