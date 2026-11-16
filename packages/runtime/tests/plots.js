// What the specs of charts and graphs share: a scene at its own size, what
// it says, and how far the page is from the picture Qt made of the same QML.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { open } from "./open.js";

export const fixtures = join(import.meta.dirname, "fixtures");

// The scene at its own size, once the font it measures with is there.
export async function ready(page, scene) {
  await open(page, scene);
  await page.waitForFunction(() => window.scene.loaded !== false);
  // A picture is the graph once each view has drawn: the JavaScript
  // renderer draws as the scene is made, the wgpu one once its wasm and
  // its adapter are here.
  await page.waitForFunction(() => [...document.querySelectorAll(".qq-view3d")].every((canvas) => canvas.$view3d?.frames > 0));
  return page.evaluate(() => {
    const { width, height } = window.scene;
    const element = document.getElementById("scene");
    element.style.width = `${width}px`;
    element.style.height = `${height}px`;
    return { x: 0, y: 0, width, height };
  });
}

export const read = (page) => page.evaluate(() => JSON.parse(JSON.stringify(window.scene.read())));
export const step = (page, index) => page.evaluate((index) => window.scene.step(index), index);

// How many pixels of the page are not those of Qt's picture, as near as the
// rounding of two painters allows: or as `slack` does, where they smooth.
// Qt's has nothing around the chart, where the page is white. The picture is
// named from `fixtures`, without what it ends in.
export async function unlike(page, clip, name, slack = 3) {
  const shot = (await page.screenshot({ clip })).toString("base64");
  const theirs = readFileSync(join(fixtures, `${name}.png`)).toString("base64");
  return page.evaluate(
    async ([slack, ...pictures]) => {
      const [ours, theirs] = await Promise.all(
        pictures.map(async (picture) => {
          const image = document.createElement("img");
          image.src = `data:image/png;base64,${picture}`;
          await image.decode();
          const canvas = new OffscreenCanvas(image.naturalWidth, image.naturalHeight);
          const context = canvas.getContext("2d", { willReadFrequently: true });
          context.fillStyle = "#ffffff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0);
          return context.getImageData(0, 0, canvas.width, canvas.height);
        }),
      );
      if (ours.width !== theirs.width || ours.height !== theirs.height) return Infinity;
      let count = 0;
      for (let i = 0; i < ours.data.length; i += 4) {
        const far = Math.max(
          Math.abs(ours.data[i] - theirs.data[i]),
          Math.abs(ours.data[i + 1] - theirs.data[i + 1]),
          Math.abs(ours.data[i + 2] - theirs.data[i + 2]),
        );
        if (far > slack) count++;
      }
      return count;
    },
    [slack, shot, theirs],
  );
}
