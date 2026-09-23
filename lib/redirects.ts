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
  // Exact article migrations must stay ahead of the broad legacy fallbacks.
  {
    source: "/new/2020/5/8/onyx-cty2-simple-mods-custom-controller-settings",
    destination: "/articles/onyx-cty2-simple-mods-custom-controller-settings-oJaAxlkjWzQ",
    permanent: true,
  },
  {
    source: "/new/2020/5/8/beyond-riders-protective-summer-mesh-shirt-full-review-and-demo",
    destination: "/articles/beyond-riders-protective-summer-mesh-shirt-review-xbmIuYY3Nbk",
    permanent: true,
  },
  {
    source: "/new/2020/5/8/2021-sur-ron-x-black-edition-first-impressions",
    destination: "/articles/2021-sur-ron-x-black-edition-first-impressions-rpnjt2f0E4Q",
    permanent: true,
  },
  {
    source: "/new/2020/5/8/onyx-lzr-electric-dirt-jumper-first-impressions-and-full-review",
    destination: "/articles/onyx-lzr-electric-dirt-jumper-review-duRZ0AwT24U",
    permanent: true,
  },
  {
    source: "/new/2020/5/8/hollyland-mars-400s-pro-first-impressions",
    destination: "/articles/hollyland-mars-400s-pro-first-impressions-fEaW95zT8Ew",
    permanent: true,
  },
  {
    source: "/new/2020/5/8/gle-dashboard-app-review-for-the-asi-bac4000-72v-sur-ron-x",
    destination: "/articles/gle-dashboard-app-review-bac4000-72v-sur-ron-x-aYkyNnyoEaI",
    permanent: true,
  },
  {
    source: "/new/2020/5/8/shredlights-sl-1000-modular-headlight-for-the-super73-z1",
    destination: "/articles/shredlights-sl-1000-super73-z1-modular-headlight-review-H_XdgESlchs",
    permanent: true,
  },
  {
    source: "/new/2020/5/8/onyx-lzr-pro-full-twist-throttle-mod-and-wheelie-test",
    destination: "/articles/onyx-lzr-pro-full-twist-throttle-mod-review-IKc0qFyGmX4",
    permanent: true,
  },
  {
    source: "/new/2020/5/8/insta360-one-x2-the-ultimate-ebike-360-camera",
    destination: "/articles/insta360-one-x2-ebike-360-camera-review-gX2UenpVb5E",
    permanent: true,
  },
  {
    source: "/new/2020/5/8/flytraks-k2-hoverboard-go-kart-kit-assembly-and-full-review",
    destination: "/articles/flytraks-k2-hoverboard-go-kart-kit-review-pbDDZ7EnArY",
    permanent: true,
  },
  {
    source: "/new/2020/5/8/why-i-switched-from-esk8-to-ebikes",
    destination: "/articles/why-i-switched-from-esk8-to-ebikes-6D6Lmdul5ZU",
    permanent: true,
  },
  {
    source: "/new/2020/5/8/72v-super73-z1-full-twist-throttle-mod",
    destination: "/articles/72v-super73-z1-full-twist-throttle-mod-W2lP0tPcYk8",
    permanent: true,
  },
  {
    source: "/new/2020/5/8/super73-diy-ebike-lighting-kit",
    destination: "/articles/super73-diy-ebike-lighting-kit-fGksJNB8YE8",
    permanent: true,
  },
  {
    source: "/new/2020/5/8/beyond-riders-protective-flannel-shirt-full-review-and-demo",
    destination: "/articles/beyond-riders-protective-flannel-shirt-review-073eNrSqRTQ",
    permanent: true,
  },
  {
    source: "/new/2020/5/8/xion-cyberx-electric-motorbike-first-impressions-and-full-review",
    destination: "/articles/xion-cyberx-electric-motorbike-review-exFn40uf57E",
    permanent: true,
  },
  {
    source: "/new/2020/5/8/super73-s2-first-impressions-and-detroit-group-ride",
    destination: "/articles/super73-s2-first-impressions-detroit-group-ride-sKhHWoE4LP4",
    permanent: true,
  },
  {
    source: "/new/2020/5/8/my-favorite-super73-z1-accessories",
    destination: "/articles/favorite-super73-z1-accessories-6cITJVoLc80",
    permanent: true,
  },
  {
    source: "/new/2020/5/8/chi-battery-systems-super73-z1-mini-fast-charger-unboxing",
    destination: "/articles/chi-battery-systems-super73-z1-mini-fast-charger-review-Glbr4dHkDow",
    permanent: true,
  },
  {
    source: "/new/2020/5/8/72v-3000w-ariel-rider-x-class-conversion-test-ride-and-full-review",
    destination: "/articles/72v-3000w-ariel-rider-x-class-conversion-review--6_L5ULNbbU",
    permanent: true,
  },
  {
    source: "/new/2020/5/8/why-the-super73-z1-is-so-much-fun",
    destination: "/articles/why-super73-z1-is-so-much-fun-en3z0WKA-MA",
    permanent: true,
  },
  {
    source: "/new/2020/5/8/volta-supply-co-surron-graphics-full-review-install",
    destination: "/articles/volta-supply-co-custom-surron-graphics-install-review-a4bI57DDiX4",
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
