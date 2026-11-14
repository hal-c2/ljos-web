// What qml6.js's sandbox script prints last: the process's CPU ticks before
// and after the measured span, its resident kilobytes and the clock's ticks
// per second. A field the script could not read comes out empty, and
// `Number("")` is 0, so each field must be digits or the run has no sample.
export function sample(stdout) {
  const fields = stdout.trim().split("\n").pop().split(" ");
  if (fields.length !== 4 || !fields.every((field) => /^\d+$/.test(field))) return null;
  const [a, b, rss, tick] = fields.map(Number);
  if (b < a || tick <= 0) return null;
  return { a, b, rss, tick };
}
