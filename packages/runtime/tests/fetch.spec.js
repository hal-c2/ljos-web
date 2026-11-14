// fetch, as ljos-ui's `features/platform/fetch.feature` has it: on the web
// it is the page's own, so a file of Ljós's API asks the network with what
// the browser gives and the same answers come back, and the same errors.
import { expect, open, test } from "./open.js";

const ACT = '{"activity": "Read a book", "n": 3}';

// The server of the feature's background: `act.json`, an echo of the
// method, the headers a script may set and the body, and a 404 for anything
// else.
async function serve(page) {
  await page.route("**/served/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/served/act.json") return route.fulfill({ contentType: "application/json", body: ACT });
    if (path === "/served/echo") {
      const headers = Object.entries(await request.allHeaders())
        .filter(([name]) => name === "content-type" || name === "connection" || name.startsWith("x-"))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, value]) => `${name}: ${value}`);
      const body = request.postDataBuffer()?.toString() ?? "";
      return route.fulfill({ contentType: "text/plain", body: [request.method(), ...headers, "", body].join("\n") });
    }
    return route.fulfill({ status: 404, contentType: "text/plain", body: "Not Found" });
  });
}

// The browser logs what it was answered with when it is not a 200, and a
// server that was not there: the feature asks for both. (One pattern: a
// fixture given two RegExps reads the second as its options.)
test.use({ told: [/status of 404 \(Not Found\)|net::ERR_CONNECTION_REFUSED/] });

const read = (page, name) => page.evaluate((name) => window.objects.got[name], name);

// The bodies the page posted, counted from before the scene is made: what
// it asks for as it completes is counted too.
let posted;

test.beforeEach(async ({ page }) => {
  await serve(page);
  posted = [];
  page.on("request", (request) => request.url().endsWith("/served/echo") && posted.push(request.postData()));
  await open(page, "fetching");
});

test.describe("a reply is a Response, whatever its status", () => {
  test("a script awaits a fetch and decodes the JSON it gives", async ({ page }) => {
    await expect.poll(() => read(page, "json")).toBe("200 true OK application/json Read a book");
  });

  test("a name the server does not have is a response that is not ok", async ({ page }) => {
    await expect.poll(() => read(page, "missing")).toBe("404 false Not Found Not Found");
  });

  test("a script sends a body with its own headers, and those it may not set are not sent", async ({ page }) => {
    await expect.poll(() => read(page, "sent")).toBe('POST\ncontent-type: application/json\nx-one: 1, 2\n\n{"a":1}');
  });

  test("a body of text is said to be text, and bytes are sent as they are", async ({ page }) => {
    await expect.poll(() => read(page, "text")).toBe("PUT\ncontent-type: text/plain;charset=UTF-8\n\nhi");
    await expect.poll(() => read(page, "bytes")).toBe("POST\n\nhi!");
  });

  test("a body is read once, as text, JSON or bytes", async ({ page }) => {
    await expect.poll(() => read(page, "once")).toBe("35 true true");
  });

  test("a server that cannot be reached rejects with a TypeError", async ({ page }) => {
    await expect.poll(() => read(page, "unreachable")).toBe("true TypeError");
  });
});

test.describe("an aborted signal stops the request, and the fetch rejects with its reason", () => {
  test("a request aborted after it is sent rejects with an AbortError", async ({ page }) => {
    await expect.poll(() => read(page, "aborted")).toBe("true AbortError 20");
  });

  test("a signal aborted with a reason rejects with that reason, before anything is sent", async ({ page }) => {
    await expect.poll(() => read(page, "reason")).toBe("abort gone gone");
    expect(posted).not.toContain("never");
  });

  test("a signal that times out rejects with a TimeoutError", async ({ page }) => {
    // "false" is what the signal was as it was made: not aborted yet.
    await expect.poll(() => read(page, "timedOut")).toBe("false TimeoutError 23");
    await expect.poll(() => read(page, "later")).toBe("TimeoutError");
  });

  test("a signal of any of others aborts with the first one's reason", async ({ page }) => {
    expect(await read(page, "either")).toBe("false true left the page threw left the page");
  });
});

test("headers keep a name once, in lower case, and join its values", async ({ page }) => {
  expect(await read(page, "headers")).toBe("x-a=1 x-b=2, 3 x-a:1 x-b:2, 3 true null");
});
