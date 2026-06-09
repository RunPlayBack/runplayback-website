export type Article = {
  id: string;
  title: string;
  slug: string;
  seoDescription: string;
  status: "draft" | "published";
  category: string;
  image: string;
  youtubeVideoId?: string;
  readTime: string;
  excerpt: string;
};

export type Video = {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  url: string;
  views: string;
};

export type BrandLogo = {
  name: string;
  image: string;
};

export const articles: Article[] = [
  {
    id: "sur-ron-battery-basics",
    title: "Electric Mini Bike Review and Real-World Ride Notes",
    slug: "e-moto-battery-upgrade-basics",
    seoDescription:
      "A RunPlayBack-style review companion for an electric mini bike video, with real-world ride notes, practical details, and the original YouTube video.",
    status: "published",
    category: "Electric Mini Bikes",
    image: "https://img.youtube.com/vi/dKj79mhbpGs/hqdefault.jpg",
    youtubeVideoId: "dKj79mhbpGs",
    readTime: "6 min read",
    excerpt:
      "A placeholder review built around a RunPlayBack YouTube video, ready for captions, description links, and final draft review.",
  },
  {
    id: "commuter-ebike-setup",
    title: "Building a Practical Everyday E-Bike Setup",
    slug: "practical-everyday-ebike-setup",
    seoDescription:
      "RunPlayBack notes on lights, tires, cargo, locks, and comfort upgrades for everyday electric bike riding.",
    status: "draft",
    category: "E-Bikes",
    image:
      "https://images.unsplash.com/photo-1558981285-6f0c94958bb6?auto=format&fit=crop&w=1200&q=80",
    readTime: "5 min read",
    excerpt:
      "The right everyday setup is less about flashy parts and more about the small pieces that make each ride easier, safer, and less annoying.",
  },
  {
    id: "scooter-range-real-world",
    title: "Why Scooter Range Changes So Much in Real Life",
    slug: "real-world-electric-scooter-range",
    seoDescription:
      "A simple breakdown of speed, rider weight, wind, temperature, and terrain for electric scooter range expectations.",
    status: "published",
    category: "Scooters",
    image:
      "https://images.unsplash.com/photo-1604187351574-c75ca79f5807?auto=format&fit=crop&w=1200&q=80",
    readTime: "4 min read",
    excerpt:
      "Spec sheets are a starting point. Real-world range depends on how and where you ride, especially once hills and colder weather show up.",
  },
];

export const videos: Video[] = [
  {
    id: "v1",
    title: "Q&A 2025",
    description:
      "A recent RunPlayBack Q&A video with rider questions and honest EV notes.",
    thumbnail:
      "https://images.squarespace-cdn.com/content/v1/5602b030e4b059089d82e3e1/1769353332421-SBOLJEKGZ9E06RLXCXYN/image-asset.jpeg?format=500w",
    url: "https://youtu.be/dKj79mhbpGs",
    views: "Popular pick",
  },
  {
    id: "v2",
    title: "Onyx RCR 80V",
    description:
      "A popular e-moto video from the RunPlayBack archive.",
    thumbnail:
      "https://images.squarespace-cdn.com/content/v1/5602b030e4b059089d82e3e1/1769353260410-87OBW7PXKRGSI33EMQLC/image-asset.jpeg?format=500w",
    url: "https://youtu.be/qlA9EwFK8MI",
    views: "Viewer favorite",
  },
  {
    id: "v3",
    title: "Segway GT3",
    description:
      "Electric scooter testing and real-world ride impressions.",
    thumbnail:
      "https://images.squarespace-cdn.com/content/v1/5602b030e4b059089d82e3e1/1769353457453-JR8A15RWWV8YMGHW4EZF/image-asset.jpeg?format=500w",
    url: "https://youtu.be/nM-d_jZH20E",
    views: "Tech tips",
  },
  {
    id: "v4",
    title: "Dual Batteries",
    description: "Battery-focused EV content and practical upgrade notes.",
    thumbnail:
      "https://images.squarespace-cdn.com/content/v1/5602b030e4b059089d82e3e1/1769353560359-CBPYSH5G6X9H8WDQDA1C/image-asset.jpeg?format=500w",
    url: "https://youtu.be/66Ab_YbV07I",
    views: "Popular pick",
  },
  {
    id: "v5",
    title: "Xion Motors",
    description: "A compact EV ride review from the RunPlayBack popular list.",
    thumbnail:
      "https://images.squarespace-cdn.com/content/v1/5602b030e4b059089d82e3e1/1769353508678-QJ8FWOY4EKGZOXGXJFL5/image-asset.jpeg?format=500w",
    url: "https://youtu.be/oZcVOcEsGRM",
    views: "Viewer favorite",
  },
  {
    id: "v6",
    title: "X2 Pro",
    description: "A RunPlayBack mini-bike and e-moto video placeholder.",
    thumbnail:
      "https://images.squarespace-cdn.com/content/v1/5602b030e4b059089d82e3e1/1737828413789-1IQTNQIZDKBWCNQOEENK/image-asset.jpeg?format=500w",
    url: "https://youtu.be/tHjjidsSs74",
    views: "Tech tips",
  },
  {
    id: "v7",
    title: "Mini Marvel",
    description: "A popular compact electric ride video.",
    thumbnail:
      "https://images.squarespace-cdn.com/content/v1/5602b030e4b059089d82e3e1/1733668136706-V785135RS6FSQIYYDBYQ/image-asset.jpeg?format=500w",
    url: "https://youtu.be/tEtHj6Tt8cQ",
    views: "Popular pick",
  },
  {
    id: "v8",
    title: "RunPlayBack Q&A",
    description: "Viewer questions, EV lifestyle notes, and practical gear talk.",
    thumbnail:
      "https://images.squarespace-cdn.com/content/v1/5602b030e4b059089d82e3e1/1733668203438-7FJ4VOP9KGQJHZ8CGWWG/image-asset.jpeg?format=500w",
    url: "https://youtu.be/SVJndE1ov9g",
    views: "Viewer favorite",
  },
];

export const brandLogos: BrandLogo[] = [
  {
    name: "EGO",
    image:
      "https://images.squarespace-cdn.com/content/v1/5602b030e4b059089d82e3e1/1727189611219-YQVYD0G1BNDT3WRY1YHR/ego.png?format=500w",
  },
  {
    name: "Lectric",
    image:
      "https://images.squarespace-cdn.com/content/v1/5602b030e4b059089d82e3e1/1727189339224-OWJ5AIRVUQ01AXC62ZA6/lectric.png?format=500w",
  },
  {
    name: "Segway",
    image:
      "https://images.squarespace-cdn.com/content/v1/5602b030e4b059089d82e3e1/1736261366268-6YKU2N8JMIADCIF0EV0K/segway+logo.png?format=500w",
  },
  {
    name: "Vevor",
    image:
      "https://images.squarespace-cdn.com/content/v1/5602b030e4b059089d82e3e1/1734534422139-D8TQQGNJJXSN6WIKVUZC/vevor.jpeg?format=500w",
  },
  {
    name: "Ride1Up",
    image:
      "https://images.squarespace-cdn.com/content/v1/5602b030e4b059089d82e3e1/1698763539898-IO4G82P34MYYWPZ6U4N8/ride1up.png?format=500w",
  },
  {
    name: "Super73",
    image:
      "https://images.squarespace-cdn.com/content/v1/5602b030e4b059089d82e3e1/1698763540739-2GQP35NV1EP8VOT9SHM7/super73.png?format=500w",
  },
  {
    name: "EBOX",
    image:
      "https://images.squarespace-cdn.com/content/v1/5602b030e4b059089d82e3e1/1720650272139-HHI5MLSI14VSUCXK53IQ/ebox.png?format=500w",
  },
  {
    name: "Yakima",
    image:
      "https://images.squarespace-cdn.com/content/v1/5602b030e4b059089d82e3e1/1698763541520-X23G2FZJ463Z840D68DS/yakima.png?format=500w",
  },
  {
    name: "Insta360",
    image:
      "https://images.squarespace-cdn.com/content/v1/5602b030e4b059089d82e3e1/1698763538917-4UFI97WJBEJHDQ82U4LG/insta360.png?format=500w",
  },
  {
    name: "Rad Power Bikes",
    image:
      "https://images.squarespace-cdn.com/content/v1/5602b030e4b059089d82e3e1/1698763539839-GHB34XI1Q9VVDXW88M96/radpower.jpg?format=500w",
  },
  {
    name: "Apollo",
    image:
      "https://images.squarespace-cdn.com/content/v1/5602b030e4b059089d82e3e1/1698780575545-APFH0PBI1LXTTRN10PGS/apollo.png?format=500w",
  },
  {
    name: "Voro Motors",
    image:
      "https://images.squarespace-cdn.com/content/v1/5602b030e4b059089d82e3e1/1733704507223-0OJSCEFV65EPUPT902CZ/voro+motors.png?format=500w",
  },
];
