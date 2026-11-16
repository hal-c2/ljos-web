// A compiler run holds Node's event loop until it ends, so its own bound is
// the only one: a compiler that hangs is ended, and says it did not end.
import { expect, test } from "@playwright/test";
import { runCompiler } from "../vite.js";

test("a compiler run that does not end is ended at its bound, and says so", () => {
  const since = Date.now();
  const ran = runCompiler("sh", ["-c", "sleep 30"], { encoding: "utf8", timeout: 300 });
  expect(Date.now() - since).toBeLessThan(10_000);
  expect(ran.error?.code).toBe("ETIMEDOUT");
  expect(ran.error.message).toBe("it did not end within 0.3 s (sh -c sleep 30)");
});

test("a compiler run that ends is as spawnSync gives it", () => {
  const ran = runCompiler("sh", ["-c", "echo said; exit 3"], { encoding: "utf8" });
  expect(ran.error).toBeUndefined();
  expect(ran.status).toBe(3);
  expect(ran.stdout).toBe("said\n");
});
