// A shared hook that stalls in a part, holding a server open. Its tests
// have far longer than the project gives a hook, which is the hook's.
import { part, serve, shared, test } from "../../served.js";

test.describe.configure({ timeout: 60_000 });

let server;
test.beforeAll(
  shared("build the site and serve it", async () => {
    server = await part("serve it", () => serve(import.meta.dirname));
    await part("build the site", () => new Promise(() => {}));
  }),
);
test.afterAll(shared("stop serving it", () => part("stop serving it", () => server?.stop())));

test("never runs", () => {});
