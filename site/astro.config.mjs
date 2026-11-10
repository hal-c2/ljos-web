import { fileURLToPath } from "node:url";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import qml from "ljos-web/vite";

const path = (r) => fileURLToPath(new URL(r, import.meta.url));

const SITE = "https://ljos.dev";

export default defineConfig({
  // DECISION: `site:` names the canonical origin so sitemap, canonical
  // and OG URLs are absolute and link previews work. This does not
  // point the domain anywhere: there is still no CNAME and no deploy
  // (Pages runs only on manual dispatch) until the user says so.
  site: SITE,
  integrations: [
    starlight({
      title: "Ljós",
      description: "Ljós is a general-purpose Rust UI toolkit that runs QML — malleable software everywhere.",
      logo: {
        src: "./src/assets/ljos.svg",
        alt: "Ljós",
        replacesTitle: true,
      },
      head: [
        { tag: "link", attrs: { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" } },
        { tag: "meta", attrs: { property: "og:image", content: new URL("/og-image.png", SITE).href } },
        { tag: "meta", attrs: { property: "og:type", content: "website" } },
        { tag: "meta", attrs: { name: "twitter:card", content: "summary_large_image" } },
        { tag: "meta", attrs: { name: "twitter:image", content: new URL("/og-image.png", SITE).href } },
      ],
      customCss: ["./src/styles/site.css"],
      social: [{ icon: "github", label: "GitHub", href: "https://github.com/hal-c2/ljos-ui" }],
      sidebar: [
        { label: "Start", autogenerate: { directory: "start" } },
        { label: "User interface", autogenerate: { directory: "ui" } },
        { label: "Controls", autogenerate: { directory: "controls" } },
        { label: "Data and input", autogenerate: { directory: "data" } },
        { label: "Language", autogenerate: { directory: "language" } },
        { label: "Quality", autogenerate: { directory: "quality" } },
        { label: "Rust", autogenerate: { directory: "rust" } },
        { label: "Live demos", link: "/demos/" },
      ],
    }),
  ],
  vite: {
    plugins: [qml({ qmlc: process.env.QMLC ?? path("../target/debug/qmlc") })],
    resolve: { dedupe: ["solid-js", "@solidjs/web", "ljos-web"] },
  },
});
