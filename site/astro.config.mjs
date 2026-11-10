import { fileURLToPath } from "node:url";
import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import qml from "ljos-web/vite";

const path = (r) => fileURLToPath(new URL(r, import.meta.url));

export default defineConfig({
  // DECISION: no `site:` URL and no CNAME yet — the domain is pointed
  // at this build only when the user says so; relative output keeps
  // artifact previews honest in the meantime.
  integrations: [
    starlight({
      title: "Ljós",
      description: "Ljós is a general-purpose Rust UI toolkit that runs QML — malleable software everywhere.",
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
