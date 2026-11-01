// A hostile shell (docs/LJOS_WEB.md A9): a string a dropped shell writes may
// reach anything that becomes style or starts a request, and nothing leaves
// for another host however it is written. Every request of the page is
// recorded while the shell runs, so what is asserted is what the browser did,
// not what the runtime meant. The page is tests/drop.html.
import { expect, test } from "./open.js";

// The guard says what it refused, for the site's author; a test of what the
// browser asked for is not a test of that.
test.use({ told: [/^not (fetched|used) while a dropped shell is shown/] });

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==", "base64");
const HOST = /(evil|cdn)\.example/;

async function opened(page, allowed) {
  const asked = [];
  page.on("request", (request) => asked.push(request.url()));
  await page.route(HOST, (route) => route.fulfill({ body: PNG, contentType: "image/png", headers: { "Access-Control-Allow-Origin": "*" } }));
  if (allowed) await page.addInitScript((hosts) => (window.allowedHosts = hosts), allowed);
  await page.goto("/drop.html");
  await page.waitForFunction(() => window.ready);
  return asked;
}

// A shell over the site's block, with `body` in it.
const shell = (body) => `import QtQuick
import Shop

Column {
    objectName: "mine"
    Basket { id: basket; objectName: "basket" }
${body}
}
`;

async function dropped(page, text) {
  await page.evaluate((text) => window.live.drop(text), text);
  await page.evaluate(() => window.flush());
  await expect(page.getByRole("alert")).toBeHidden();
}

// What was asked of the browser has been laid out, painted and sent for.
const drawn = (page) =>
  page.evaluate(async () => {
    for (let frame = 0; frame < 3; frame++) await new Promise(requestAnimationFrame);
    await new Promise((done) => setTimeout(done, 50));
  });

const away = (asked) => asked.filter((url) => HOST.test(url));
const hostile = (kind, given) => `    Hostile { kind: ${JSON.stringify(kind)}; given: ${JSON.stringify(given)} }`;

const at = (name) => `https://evil.example/${name}`;
const url = (name) => `url(${at(name)})`;

// One sink each: where the string goes, and what it says there.
const SINKS = [
  // What a shell writes itself.
  ["a shell's Rectangle.color", (name) => `    Rectangle { width: 40; height: 20; color: "${url(name)}" }`],
  ["a shell's Rectangle.color worked out from a block's state", (name) => `    Rectangle { width: 40; height: 20; color: "url(${at(name)}/" + basket.count + ")" }`],
  ["a shell's Rectangle.border.color", (name) => `    Rectangle { width: 40; height: 20; border.width: 2; border.color: "${url(name)}" }`],
  ["a shell's Text.color", (name) => `    Text { text: "x"; color: "${url(name)}" }`],
  ["a shell's Text.font.family", (name) => `    Text { text: "x"; font.family: "${url(name)}" }`],
  // Each way a colour can carry a picture into `background`.
  ...[
    ["a colour before a picture", (name) => `red ${url(name)}`],
    ["a hex colour before a picture", (name) => `#123 ${url(name)}`],
    ["a picture before a colour", (name) => `${url(name)} red`],
    ["image-set with a string", (name) => `image-set("${at(name)}" 1x)`],
    ["image-set with a url", (name) => `image-set(${url(name)} 1x)`],
    ["an escaped url", (name) => `u\\72l(${at(name)})`],
    ["a quoted url", (name) => `url("${at(name)}")`],
    ["a url in capitals", (name) => `URL(${at(name)})`],
    ["a url behind a comment", (name) => `/**/url(${at(name)})`],
    ["a gradient over a picture", (name) => `linear-gradient(red, blue), ${url(name)}`],
    ["a gradient within cross-fade", (name) => `cross-fade(${url(name)} 50%, red)`],
  ].map(([what, given]) => [`a block's Rectangle.color, ${what}`, (name) => hostile("rectangle", given(name))]),
  // What a block does with a string a shell gives it.
  ...[
    ["Rectangle.border.color", "border"],
    ["a GradientStop's color", "gradient"],
    ["Window.color", "window"],
    ["a colour written as an array", "array"],
    ["a property of type color", "value"],
    ["Text.color", "ink"],
    ["Text.linkColor", "link"],
    ["Text.styleColor", "outline"],
    ["Text.font.family", "family"],
    ["Text.font.features", "features"],
    ["TextInput's colours", "input"],
    ["a Canvas's styles, filter and font", "canvas"],
    ["ShapePath's fill and stroke", "shape"],
    ["a Shape gradient's stop", "shapeGradient"],
    ["a ConicalGradient's stop", "conical"],
    ["RectangularShadow.color", "shadow"],
    ["MultiEffect's colours", "effect"],
    ["MouseArea.cursorShape", "cursor"],
    ["HoverHandler.cursorShape", "hover"],
    ["ChartView's colours", "chart"],
  ].map(([what, kind]) => [`a block's ${what}`, (name) => hostile(kind, url(name))]),
  ["a block's cursor, with a fallback", (name) => hostile("cursor", `${url(name)}, auto`)],
  ["a block's ConicalGradient.angle, out of the number's place", (name) => hostile("conicalAngle", `0deg, red), ${url(name)}, conic-gradient(red, blue 5`)],
  ["a block's Image.Tile", (name) => hostile("tiled", at(name))],
  ["a block's BorderImage", (name) => hostile("border_image", at(name))],
  // Rich text a block sets from what a shell gives it.
  ["rich text's <img>", (name) => hostile("rich", `<img src='${at(name)}'>`)],
  ["rich text's style", (name) => hostile("rich", `<span style='background-image:${url(name)}'>x</span>`)],
  ["rich text's style with image-set", (name) => hostile("rich", `<span style='background-image:image-set("${at(name)}" 1x);color:image-set("${at(name)}" 1x)'>x</span>`)],
  ["rich text's bgcolor", (name) => hostile("rich", `<table bgcolor='${url(name)}'><tr><td>x</td></tr></table>`)],
  ["rich text's <font color>", (name) => hostile("rich", `<font color='red ${url(name)}'>x</font>`)],
  ["rich text's <font face>", (name) => hostile("rich", `<font face='${url(name)}'>x</font>`)],
  ["rich text's list", (name) => hostile("rich", `<ul type='${url(name)}' style='list-style-image:${url(name)}'><li>x</li></ul>`)],
  ["rich text's markup that the browser would load", (name) => hostile("rich", `<svg><image href='${at(name)}'/></svg><link rel='stylesheet' href='${at(name)}'><style>@import '${at(name)}';</style><object data='${at(name)}'></object>`)],
];

test.describe("a hostile shell", () => {
  SINKS.forEach(([sink, written], index) => {
    test(`${sink}: nothing leaves for another host`, async ({ page }) => {
      const asked = await opened(page);
      await dropped(page, shell(written(`sink-${index}`)));
      await drawn(page);
      expect(away(asked)).toEqual([]);
    });
  });

  // Text a shell writes is plain, written as rich or told later that it is.
  test("A shell's Text cannot be written as rich, and says so", async ({ page }) => {
    await opened(page);
    await page.evaluate((text) => window.live.drop(text), shell(`    Text { textFormat: Text.RichText; text: "x" }`));
    await expect(page.getByRole("alert")).toHaveText(/a shell's text is plain: `textFormat` is not in its scope/);
  });

  test("A shell's handler cannot make its Text rich", async ({ page }) => {
    const asked = await opened(page);
    const text = shell(`    Text { id: late; text: "<img src='${at("late")}'>" }\n    MouseArea { width: 40; height: 40; onClicked: late.textFormat = Text.RichText }`);
    const refused = await page.evaluate(async (text) => {
      await window.live.drop(text);
      await window.flush();
      return document.querySelector("[role=alert]")?.textContent ?? "";
    }, text);
    await drawn(page);
    expect(away(asked)).toEqual([]);
    expect(refused).toMatch(/textFormat/);
  });

  test("A shell's Text shows markup as it is written", async ({ page }) => {
    const asked = await opened(page);
    await dropped(page, shell(`    Text { objectName: "plain"; text: "<img src='${at("plain")}'>" }`));
    await drawn(page);
    await expect(page.getByText(`<img src='${at("plain")}'>`)).toBeVisible();
    expect(away(asked)).toEqual([]);
  });

  // Were anything to slip past the sinks, the picture of the page would go and
  // read it: the element's own request is an image, the picture's a fetch.
  test("The inspector's picture of a page fetches nothing while a shell is shown", async ({ page }) => {
    const fetches = [];
    page.on("request", (request) => request.resourceType() === "fetch" && HOST.test(request.url()) && fetches.push(request.url()));
    await opened(page);
    await dropped(page, shell(`    Rectangle { objectName: "plain"; width: 40; height: 20; color: "red" }`));
    const said = await page.evaluate(async (address) => {
      window.scene.$node.append(Object.assign(document.createElement("img"), { src: address }));
      return JSON.stringify(await window.pictureOf(window.scene));
    }, at("picture"));
    expect(fetches).toEqual([]);
    expect(said).toMatch(/shows https:\/\/evil\.example\/picture/);
  });

  // What a shell is for still works in the same page, on the same sinks.
  test("A real colour, a gradient and an allowed host still work", async ({ page }) => {
    const asked = await opened(page, ["cdn.example"]);
    await dropped(
      page,
      shell(`    Rectangle { objectName: "plain"; width: 40; height: 20; color: "#80ff0000" }
    Rectangle { objectName: "named"; width: 40; height: 20; color: "steelblue" }
    Rectangle { objectName: "modern"; width: 40; height: 20; color: "rgb(1 2 3 / 50%)" }
    Rectangle { objectName: "lined"; width: 40; height: 20; border.width: 2; border.color: "green" }
    Text { objectName: "inked"; text: "x"; color: "red"; font.family: "Sans Serif" }
    Hostile { objectName: "ramp"; kind: "gradient"; given: "red" }
    Hostile { objectName: "swept"; kind: "conical"; given: "red" }
    Hostile { objectName: "picture"; kind: "tiled"; given: "https://cdn.example/fine.png" }`),
    );
    await drawn(page);
    const look = await page.evaluate(() => {
      const search = (from, name) => {
        const queue = [...(from.children ?? [])];
        while (queue.length) {
          const item = queue.shift();
          if (item.objectName === name) return item;
          queue.push(...(item.children ?? []));
        }
        return null;
      };
      const style = (name) => getComputedStyle(search(window.scene, name).$node);
      const under = (name) => search(search(window.scene, name), "sunk").$node;
      const swept = search(window.scene, "swept").$node.querySelector("foreignObject div, foreignObject *");
      return {
        plain: style("plain").backgroundColor,
        named: style("named").backgroundColor,
        modern: style("modern").backgroundColor,
        lined: style("lined").boxShadow,
        inked: getComputedStyle(search(window.scene, "inked").$node.querySelector(".qq-text") ?? search(window.scene, "inked").$node).color,
        ramp: getComputedStyle(under("ramp")).backgroundImage,
        swept: swept ? getComputedStyle(swept).backgroundImage : "",
      };
    });
    expect(look).toEqual({
      plain: "rgba(255, 0, 0, 0.5)",
      named: "rgb(70, 130, 180)",
      modern: "rgba(1, 2, 3, 0.5)",
      lined: "rgb(0, 128, 0) 0px 0px 0px 2px inset",
      inked: "rgb(255, 0, 0)",
      ramp: "linear-gradient(rgb(255, 0, 0) 0%, rgb(0, 0, 255) 100%)",
      swept: expect.stringContaining("conic-gradient"),
    });
    expect(away(asked)).toContain("https://cdn.example/fine.png");
  });

  test("A page showing no dropped shell is not touched", async ({ page }) => {
    await opened(page);
    const shown = await page.evaluate(async () => {
      const swatch = window.scene.children.find((child) => child.objectName === "swatch");
      swatch.color = "url(/never.png) red";
      window.flush();
      return swatch.$node.style.background;
    });
    expect(shown).toContain("url(");
  });
});
