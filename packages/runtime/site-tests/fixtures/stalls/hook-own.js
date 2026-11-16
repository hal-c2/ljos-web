// A shared hook with a time of its own, longer than the project's.
import { part, shared, test } from "../../served.js";

test.beforeAll(shared("wait for its own time", () => part("wait", () => new Promise(() => {})), { timeout: 6_000 }));

test("never runs either", () => {});
