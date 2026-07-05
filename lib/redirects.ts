export type RedirectRule = {
  source: string;
  destination: string;
  permanent: true;
};

export const redirects: RedirectRule[] = [
  {
    source: "/home",
    destination: "/",
    permanent: true,
  },
  {
    source: "/index",
    destination: "/",
    permanent: true,
  },
  {
    source: "/index.html",
    destination: "/",
    permanent: true,
  },
  {
    source: "/blog",
    destination: "/articles",
    permanent: true,
  },
  {
    source: "/blog/:path*",
    destination: "/articles",
    permanent: true,
  },
  {
    source: "/new",
    destination: "/articles",
    permanent: true,
  },
  {
    source: "/new/:path*",
    destination: "/articles",
    permanent: true,
  },
  {
    source: "/reviews",
    destination: "/articles",
    permanent: true,
  },
  {
    source: "/reviews/:path*",
    destination: "/articles",
    permanent: true,
  },
  {
    source: "/popular-videos",
    destination: "/popularvideos",
    permanent: true,
  },
  {
    source: "/popular-videos/:id",
    destination: "/popularvideos/:id",
    permanent: true,
  },
  {
    source: "/videos",
    destination: "/popularvideos",
    permanent: true,
  },
  {
    source: "/popularvideos.html",
    destination: "/popularvideos",
    permanent: true,
  },
  {
    source: "/contact-us",
    destination: "/contact",
    permanent: true,
  },
  {
    source: "/contact.html",
    destination: "/contact",
    permanent: true,
  },
  {
    source: "/search.html",
    destination: "/search",
    permanent: true,
  },
  {
    source: "/partner.html",
    destination: "/partner",
    permanent: true,
  },
];
