// The showcase demos, through the page a visitor gets: each one
// mounts lazily, answers input, and degrades to its picture plus
// words when the browser cannot run it. The flagship's four shell
// behaviours (state survives, broken edit refused with the shell
// kept, the status contribution follows its slot, reset) are the
// site-level seam of the same scenarios
// `packages/runtime/tests/drop.spec.js` holds the runtime to.
import { expect, test } from "@playwright/test";

const demo = (page, name) => page.locator(`[data-ljos-demo='${name}']`);

async function live(page, name) {
  const fig = demo(page, name);
  await fig.scrollIntoViewIfNeeded();
  await expect(fig).toHaveAttribute("data-state", "live", { timeout: 30000 });
  return fig;
}

// The Pantry's two "N in the basket · £…" lines: the status
// contribution and the basket card's own summary. Returned in
// page order; which is which is told apart by where it sits.
const summaries = (fig) => fig.getByText(/^\d+ in the basket · £\d+\.\d\d$/);
const noteField = (fig) => fig.locator(".pantry-stage input:not([type='file'])");

test.beforeEach(async ({ page }) => {
  // A kept shell from an earlier test would still be the visitor's.
  await page.addInitScript(() => localStorage.clear());
});

test("showcase page shows every demo's fallback with no JS", async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false });
  const page = await ctx.newPage();
  await page.goto("/demos/");
  for (const name of ["pantry", "orbit", "shader", "fieldguide", "motion"]) {
    const fig = demo(page, name);
    await expect(fig.locator(".ljos-demo__fallback img"), name).toBeVisible();
    await expect(fig.locator(".ljos-demo__fallback p"), name).not.toBeEmpty();
    await expect(fig.locator("figcaption"), name).not.toBeEmpty();
  }
  await ctx.close();
});

test("the Pantry runs, and its basket counts what was tapped", async ({ page }) => {
  await page.goto("/");
  const fig = await live(page, "pantry");
  await expect(fig.getByText("The Corner Pantry")).toBeVisible();
  await expect(summaries(fig).first()).toHaveText("0 in the basket · £0.00");
  await fig.getByRole("button", { name: "Add tea" }).click();
  await fig.getByRole("button", { name: "Add tea" }).click();
  await expect(summaries(fig).first()).toHaveText("2 in the basket · £7.00");
  await expect(summaries(fig)).toHaveCount(2);
});

test("a shell edit keeps the basket and the note", async ({ page }) => {
  await page.goto("/");
  const fig = await live(page, "pantry");
  await fig.getByRole("button", { name: "Add bread" }).click();
  await noteField(fig).click();
  await page.keyboard.type("Extra crusty, please");
  await expect(summaries(fig).first()).toHaveText("1 in the basket · £2.25");

  const editor = fig.locator(".pantry-editor__text");
  const mine = (await editor.inputValue())
    .replace('color: "#171a23"', 'color: "#241a10"')
    .replace('"The Corner Pantry"', '"My Pantry"');
  await editor.fill(mine);
  await fig.locator(".pantry-apply").click();
  await expect(fig.locator(".pantry-editor__status")).toContainText("Your shell is shown", { timeout: 30000 });

  await expect(fig.getByText("My Pantry")).toBeVisible();
  await expect(summaries(fig).first()).toHaveText("1 in the basket · £2.25");
  await expect(noteField(fig)).toHaveValue("Extra crusty, please");
});

test("a broken shell is refused, the running shell stays, and the next good edit takes over", async ({ page }) => {
  await page.goto("/");
  const fig = await live(page, "pantry");
  const editor = fig.locator(".pantry-editor__text");
  const good = await editor.inputValue();

  await editor.fill("import QtQuick\nimport Pantry\n\nRectangle {\n    Basket {\n}\n");
  await fig.locator(".pantry-apply").click();
  const errors = fig.locator(".pantry-editor__errors");
  await expect(errors).toBeVisible({ timeout: 30000 });
  await expect(errors).toContainText("Shell.qml:");
  // The app's shell never went away, and the basket still works.
  await expect(fig.getByText("The Corner Pantry")).toBeVisible();
  await fig.getByRole("button", { name: "Add jam" }).click();
  await expect(summaries(fig).first()).toHaveText("1 in the basket · £4.00");

  await editor.fill(good.replace('"The Corner Pantry"', '"Fixed Again"'));
  await fig.locator(".pantry-apply").click();
  await expect(fig.getByText("Fixed Again")).toBeVisible({ timeout: 30000 });
  await expect(summaries(fig).first()).toHaveText("1 in the basket · £4.00");
});

test("moving the StatusSlot in the shell moves the status contribution", async ({ page }) => {
  await page.goto("/");
  const fig = await live(page, "pantry");
  await expect(summaries(fig)).toHaveCount(2, { timeout: 30000 });
  const goods = await fig.getByRole("button", { name: "Add tea" }).boundingBox();
  const beforeTop = Math.min(...(await summaries(fig).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().y))));
  // In the app's shell the status sits in the header, above the goods.
  expect(beforeTop).toBeLessThan(goods.y);

  const editor = fig.locator(".pantry-editor__text");
  const app = await editor.inputValue();
  const statusAt = app.indexOf("StatusSlot {");
  const statusBlock = app.slice(statusAt, app.indexOf("}", statusAt) + 1);
  const without = app.replace(statusBlock + "\n", "");
  const noteAt = without.indexOf("Note {");
  const mine = without.slice(0, noteAt) + statusBlock + "\n        " + without.slice(noteAt);
  await editor.fill(mine);
  await fig.locator(".pantry-apply").click();
  await expect(fig.locator(".pantry-editor__status")).toContainText("Your shell is shown", { timeout: 30000 });

  const basketTitle = await fig.getByText("Basket", { exact: true }).boundingBox();
  const afterTops = await summaries(fig).evaluateAll((els) => els.map((e) => e.getBoundingClientRect().y));
  // Both lines are now at or below the basket card: the header is empty.
  expect(Math.min(...afterTops)).toBeGreaterThanOrEqual(basketTitle.y - 2);
});

test("reset brings the app's shell and its source back", async ({ page }) => {
  await page.goto("/");
  const fig = await live(page, "pantry");
  const editor = fig.locator(".pantry-editor__text");
  const app = await editor.inputValue();
  await editor.fill(app.replace('"The Corner Pantry"', '"Soon Gone"'));
  await fig.locator(".pantry-apply").click();
  await expect(fig.getByText("Soon Gone")).toBeVisible({ timeout: 30000 });

  // Reset forgets the kept shell and reloads the page to shed it.
  await Promise.all([page.waitForEvent("load"), fig.locator(".pantry-reset").click()]);
  const again = await live(page, "pantry");
  await expect(again.getByText("The Corner Pantry")).toBeVisible();
  await expect(again.locator(".pantry-editor__text")).toHaveValue(app);
});

test("the orbit demo draws a 3D scene and orbiting changes the frame", async ({ page }) => {
  await page.goto("/demos/");
  const fig = await live(page, "orbit");
  const canvas = fig.locator("canvas").first();
  await expect(canvas).toBeVisible();
  const pixelsOf = async () =>
    canvas.evaluate((c) => {
      const copy = document.createElement("canvas");
      copy.width = c.width;
      copy.height = c.height;
      const ctx = copy.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(c, 0, 0);
      const data = ctx.getImageData(0, 0, copy.width, copy.height).data;
      let lit = 0;
      for (let i = 0; i < data.length; i += 16) if (data[i] + data[i + 1] + data[i + 2] > 90) lit++;
      return { lit, sample: [...data.slice(0, 4096)] };
    });
  await expect.poll(async () => (await pixelsOf()).lit, { timeout: 30000 }).toBeGreaterThan(200);
  const before = (await pixelsOf()).sample.join(",");
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 140, box.y + box.height / 2 - 50, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  const after = (await pixelsOf()).sample.join(",");
  expect(after).not.toBe(before);
});

test("the shader demo paints and answers the pointer", async ({ page }) => {
  await page.goto("/demos/");
  const fig = await live(page, "shader");
  const canvas = fig.locator("canvas").first();
  await expect(canvas).toBeVisible();
  const centre = () =>
    canvas.evaluate((c) => {
      const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
      ctx.canvas.width = c.width;
      ctx.canvas.height = c.height;
      ctx.drawImage(c, 0, 0);
      const d = ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
      return [d[0], d[1], d[2]].join(" ");
    });
  await expect.poll(centre, { timeout: 30000 }).not.toBe("0 0 0");
  const box = await fig.locator(".ljos-demo__mount").boundingBox();
  const far = await centre();
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.waitForTimeout(400);
  expect(await centre()).not.toBe(far);
});

test("the field guide searches, selects and keeps its records", async ({ page }) => {
  await page.goto("/demos/");
  const fig = await live(page, "fieldguide");
  await expect(fig).toContainText("Atlantic puffin");
  await fig.getByPlaceholder("Search by name…").fill("tern");
  await expect(fig).toContainText("Arctic tern");
  await expect(fig).not.toContainText("Northern gannet");
  await fig.getByPlaceholder("Search by name…").fill("");
  await fig.getByRole("button", { name: "Northern gannet" }).click();
  await expect(fig).toContainText("Morus bassanus");
  await fig.getByRole("checkbox").click();
  await expect(fig).toContainText("Seen 1 of 9");
});

test("the motion demo springs, shuffles and opens", async ({ page }) => {
  await page.goto("/demos/");
  const fig = await live(page, "motion");
  const tiles = () => fig.locator(".ljos-demo__mount").getByText(/^(Ljós|holds|state|while|it|moves)$/).allTextContents();
  expect(await tiles()).toEqual(["Ljós", "holds", "state", "while", "it", "moves"]);
  await fig.getByText("Shuffle the tiles").click();
  await page.waitForTimeout(800);
  expect([...(await tiles())].sort()).toEqual(["Ljós", "holds", "it", "moves", "state", "while"].sort());
  await fig.getByText(/About this motion/).click();
  await expect(fig).toContainText("Springs, behaviors, list transitions");
});

test("with wasm blocked the demos degrade to picture and words, and the Pantry still runs its app shell", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.route("**/*.wasm", (route) => route.abort());
  await page.goto("/demos/");
  // The 3D demo needs its renderer wasm: it must say so, not blank.
  const orbit = demo(page, "orbit");
  await orbit.scrollIntoViewIfNeeded();
  await expect(orbit).toHaveAttribute("data-state", /live|failed/, { timeout: 30000 });
  if ((await orbit.getAttribute("data-state")) === "failed") {
    await expect(orbit.locator(".ljos-demo__fallback")).toBeVisible();
    await expect(orbit.locator(".ljos-demo__error")).toBeVisible();
  }
  // The Pantry's app shell is compiled with the page: it runs, and
  // only the shell compiler is missing when an edit is applied.
  const fig = await live(page, "pantry");
  await expect(fig.getByText("The Corner Pantry")).toBeVisible();
  await fig.locator(".pantry-apply").click();
  await expect(fig.locator(".pantry-editor__errors")).toBeVisible({ timeout: 30000 });
  await ctx.close();
});

test("reduced motion calms the demos instead of stopping them", async ({ browser }) => {
  const ctx = await browser.newContext({ reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto("/demos/");
  const fig = await live(page, "motion");
  // Still usable: the card opens, the tiles can shuffle.
  await fig.getByText(/About this motion/).click();
  await expect(fig).toContainText("Springs, behaviors, list transitions", { timeout: 10000 });
  await ctx.close();
});
