// A live code block's relative addresses are among the example's own
// files (its fences, its harness), not the page's: a ShellLoader's
// `source` and `fallback`, an Image's, a model's. What the example
// does not have is not there, as a file that is not on disk is not
// there for `ljos run` (ljos-ui features/blocks/shell-loader.feature),
// said beside the code at the line that names it, and the server is
// never asked for it.
import { NAMED } from "./examplefiles-fixtures.js";
import { expect, test } from "./open.js";

// Everything the page asked of the server, and what it answered with
// a failure.
function watched(page) {
  const asked = [];
  const refused = [];
  page.on("request", (request) => asked.push(request.url()));
  page.on("response", (response) => {
    if (response.status() >= 400) refused.push(`${response.status()} ${response.url()}`);
  });
  return { named: () => asked.filter((url) => NAMED.test(new URL(url).pathname)), refused };
}

async function mounted(page, name) {
  await page.goto("/examplefiles.html");
  await page.waitForFunction(() => window.ready);
  await page.evaluate((name) => window.mountExample(name), name);
  return page.locator(`[data-example="${name}"]`);
}

test.describe("an example's files", () => {
  // The loader warns of what it could not show, as it does natively.
  test.use({ told: [/^ShellLoader: (?:fallback: )?(?:shell|AppShell)\.qml: No such file or directory$/] });

  test("a shell and a fallback the example does not have are not there, and are not fetched", async ({ page }) => {
    const server = watched(page);
    const figure = await mounted(page, "neither");
    await expect(figure).toHaveAttribute("data-state", "live", { timeout: 30000 });
    const stage = figure.locator(".ljos-codeblock__stage");
    await expect(stage).toContainText(/^3 shell\.qml: No such file or directory\s+fallback: AppShell\.qml: No such file or directory$/, {
      timeout: 15000,
    });
    // Said beside the code, where the reader wrote each name.
    const errors = figure.getByRole("alert");
    await expect(errors).toContainText("Main.qml:4: shell.qml: No such file or directory");
    await expect(errors).toContainText("Main.qml:5: AppShell.qml: No such file or directory");
    expect(server.named()).toEqual([]);
    expect(server.refused).toEqual([]);
  });

  test("a shell named only when the example runs is found among its files", async ({ page }) => {
    const server = watched(page);
    const figure = await mounted(page, "chosen");
    await expect(figure).toHaveAttribute("data-state", "live", { timeout: 30000 });
    await expect(figure.locator(".ljos-codeblock__stage")).toContainText("My shell", { timeout: 15000 });
    await expect(figure.getByRole("alert")).toBeHidden();
    expect(server.named()).toEqual([]);
    expect(server.refused).toEqual([]);
  });

  test("a picture the example does not have is not there, and is not fetched", async ({ page }) => {
    const server = watched(page);
    const figure = await mounted(page, "picture");
    await expect(figure).toHaveAttribute("data-state", "live", { timeout: 30000 });
    await expect(figure.locator(".ljos-codeblock__stage")).toContainText("no picture", { timeout: 15000 });
    await expect(figure.getByRole("alert")).toContainText("Main.qml:9: logo.png: No such file or directory");
    expect(server.named()).toEqual([]);
    expect(server.refused).toEqual([]);
  });

  test("a request reads a file the example has, and one it does not have is not there", async ({ page }) => {
    const server = watched(page);
    const figure = await mounted(page, "read");
    await expect(figure).toHaveAttribute("data-state", "live", { timeout: 30000 });
    await expect(figure.locator(".ljos-codeblock__stage")).toContainText("200 hello / status 0", { timeout: 15000 });
    await expect(figure.getByRole("alert")).toContainText("Main.qml:19: notes.json: No such file or directory");
    await expect(figure.getByRole("alert")).not.toContainText("data.json");
    expect(server.named()).toEqual([]);
    expect(server.refused).toEqual([]);
  });

  test("a name with a % that starts no escape is looked for as written", async ({ page }) => {
    const server = watched(page);
    const figure = await mounted(page, "percent");
    await expect(figure).toHaveAttribute("data-state", "live", { timeout: 30000 });
    await expect(figure.locator(".ljos-codeblock__stage")).toContainText("no picture", { timeout: 15000 });
    await expect(figure.getByRole("alert")).toContainText("Main.qml:9: 100%.png: No such file or directory");
    expect(server.named()).toEqual([]);
    expect(server.refused).toEqual([]);
  });

  test("a file a script asks for as the example compiles, and does not have, is said to be not there", async ({ page }) => {
    const server = watched(page);
    const figure = await mounted(page, "early");
    await expect(figure).toHaveAttribute("data-state", "live", { timeout: 30000 });
    await expect(figure.locator(".ljos-codeblock__stage")).toContainText("asked true", { timeout: 15000 });
    await expect(figure.getByRole("alert")).toContainText("early.js:3: early.json: No such file or directory");
    expect(server.named()).toEqual([]);
    expect(server.refused).toEqual([]);
  });
});

  test("takes the example's files with it, and the addresses they were loaded from", async ({ page }) => {
    const figure = await mounted(page, "read");
    await expect(figure.locator(".ljos-codeblock__stage")).toContainText("200 hello", { timeout: 30000 });
    const before = await page.evaluate(() => window.enclosed());
    const [root] = Object.keys(before);
    expect(before[root].length).toBeGreaterThan(0);
    await page.evaluate(() => window.disposeExample("read"));
    expect(await page.evaluate(() => window.enclosed())).toEqual({});
    // An address a file was loaded from loads nothing now.
    const loads = await page.evaluate(
      (urls) => Promise.all(urls.map((url) => fetch(url).then(() => true, () => false))),
      before[root],
    );
    expect(loads.every((loaded) => !loaded)).toBe(true);
  });

  test("while its first compile is on its way takes the project that compile gives", async ({ page }) => {
    await page.goto("/examplefiles.html");
    await page.waitForFunction(() => window.ready);
    await page.evaluate(() => window.mountExample("chosen", false));
    await page.evaluate(() => window.disposeExample("chosen"));
    expect(await page.evaluate(() => window.enclosed())).toEqual({});
  });
});

test.describe("an example's shell reloaded", () => {
  test.use({ told: [/^ShellLoader: (?:reload: )?Gone\.qml: No such file or directory$/] });

  test("onto a source the example does not have says so beside the code, and the shell shown stays", async ({ page }) => {
    const server = watched(page);
    const figure = await mounted(page, "reloaded");
    await expect(figure).toHaveAttribute("data-state", "live", { timeout: 30000 });
    await expect(figure.locator(".ljos-codeblock__stage")).toContainText("My shell", { timeout: 15000 });
    await expect(figure.getByRole("alert")).toContainText("Main.qml:12: Gone.qml: No such file or directory");
    expect(server.named()).toEqual([]);
    expect(server.refused).toEqual([]);
  });
});
