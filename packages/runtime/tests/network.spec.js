import { expect, open, test } from "./open.js";

const ONLINE = 4;
const DISCONNECTED = 1;
const UNKNOWN = 0;

const read = (page) => page.evaluate(() => window.scene.read());
const seen = (page) => page.evaluate(() => window.scene.seen.splice(0));

test("NetworkInformation says what the browser tells of its network", async ({ page }) => {
  await open(page, "network");
  // Chromium has no Network Information type here, so no medium; it is
  // online, and a browser never tells of a captive portal.
  expect(await read(page)).toEqual([ONLINE, UNKNOWN, false, false, true, DISCONNECTED, 3]);
});

test("NetworkInformation follows the browser going offline and back", async ({ page, context }) => {
  await open(page, "network");
  await context.setOffline(true);
  await page.waitForFunction(() => !window.scene.online);
  expect(await read(page)).toEqual([DISCONNECTED, UNKNOWN, false, false, false, DISCONNECTED, 3]);
  await context.setOffline(false);
  await page.waitForFunction(() => window.scene.online);
  expect(await seen(page)).toEqual([
    ["reachability", DISCONNECTED],
    ["reachability", ONLINE],
  ]);
});

test("NetworkInformation reads what carries the network, where the browser says", async ({ page }) => {
  await page.addInitScript(() => {
    const connection = new EventTarget();
    Object.assign(connection, { type: "cellular", saveData: false });
    Object.defineProperty(navigator, "connection", { value: connection, configurable: true });
    window.connection = connection;
  });
  await open(page, "network");
  expect(await read(page)).toEqual([ONLINE, 2, true, false, true, DISCONNECTED, 3]);
  await page.evaluate(() => {
    Object.assign(window.connection, { type: "wifi", saveData: false });
    window.connection.dispatchEvent(new Event("change"));
  });
  await page.waitForFunction(() => window.scene.read()[1] === 3);
  expect(await read(page)).toEqual([ONLINE, 3, false, false, true, DISCONNECTED, 3]);
});

test("NetworkInformation refuses a program's word for the browser's, and still follows the browser", async ({ page, context }) => {
  await open(page, "network");
  expect(await page.evaluate(() => window.scene.assign())).toBe('TypeError: Cannot assign to read-only property "reachability"');
  await context.setOffline(true);
  await page.waitForFunction(() => !window.scene.online);
  expect((await read(page))[0]).toBe(DISCONNECTED);
  await context.setOffline(false);
});
