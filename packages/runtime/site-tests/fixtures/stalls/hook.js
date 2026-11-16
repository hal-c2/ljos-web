// A shared hook that stalls in a part, holding a server open.
import { part, serve, shared, test } from "../../served.js";

let server;
test.beforeAll(
  shared("build the site and serve it", async () => {
    server = await part("serve it", () => serve(import.meta.dirname));
    await part("build the site", () => new Promise(() => {}));
  }),
);
test.afterAll(shared("stop serving it", () => part("stop serving it", () => server?.stop())));

test("never runs", () => {});
