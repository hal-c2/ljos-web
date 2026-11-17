// The list reporter marks a test that fails as `test.fail` expects with
// the same ✘ as a real failure, and says nothing more: a reader of the log
// cannot tell a known gap from a break, nor whether it failed for the
// reason it is known for. This prints, under each one, the reason it is
// known to fail (known.js, interactions.js) and how it failed this time.
export default class KnownReporter {
  printsToStdio() {
    return true;
  }

  onTestEnd(test, result) {
    if (test.expectedStatus !== "failed" || result.status !== "failed") return;
    const known = test.annotations
      .filter((note) => note.type === "fail" && note.description)
      .map((note) => note.description)
      .join("; ");
    const how = (result.error?.message ?? "no error")
      .replace(/\x1b\[[0-9;]*m/g, "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(" ");
    process.stdout.write(`      known to fail: ${known || "no reason given"}\n      failed with: ${how}\n`);
  }
}
