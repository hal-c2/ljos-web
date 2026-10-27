// Playwright reporter: the report as a table on the terminal, and in
// `report/` as `report.json` and an `index.html` with the pictures side by
// side.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expectedFile, readExpected, reportDirectory } from "./settings.js";

const percent = (value) => (value === null ? null : `${(value * 100).toFixed(1)}%`);
const yes = (value) => (value ? "yes" : "no");
const escape = (text) => String(text).replace(/[&<>"]/g, (character) => `&#${character.charCodeAt(0)};`);

// What to show where a score would be: `-` when the page did not render,
// `no ref` when Qt has no picture to compare with.
const score = (row, name) => (!row.reference ? "no ref" : row.mismatch ? "size" : (percent(row[name]) ?? "-"));

export default class Table {
  rows = [];
  failures = [];

  printsToStdio() {
    return true;
  }

  onBegin() {
    rmSync(reportDirectory, { recursive: true, force: true });
    mkdirSync(reportDirectory, { recursive: true });
  }

  onTestEnd(test, result) {
    const attachment = result.attachments.find(({ name }) => name === "example");
    if (attachment) this.rows.push(JSON.parse(attachment.body.toString()));
    if (result.status !== "passed" && result.status !== "skipped") {
      const message = (result.error?.message ?? result.status).replace(/\u001b\[[0-9;]*m/g, "");
      this.failures.push(message.split("\n")[0].replace(/^Error: /, ""));
    }
  }

  onError(error) {
    this.failures.push(error.message ?? String(error));
  }

  onEnd() {
    const rows = this.rows.sort((a, b) => a.id.localeCompare(b.id, "en", { sensitivity: "base" }));
    const sum = (count) => rows.reduce((total, row) => total + count(row), 0);
    const lines = [
      ["example", "files", "entry", "renders", "pixels", "content", "what stops it"],
      ...rows.map((row) => [
        row.id,
        `${row.compiled}/${row.files}`,
        yes(row.entryCompiles),
        yes(row.renders),
        score(row, "pixels"),
        score(row, "content"),
        (row.error ?? row.mismatch ?? "").split("\n")[0],
      ]),
      [
        "total",
        `${sum((row) => row.compiled)}/${sum((row) => row.files)}`,
        `${sum((row) => row.entryCompiles)}/${rows.length}`,
        `${sum((row) => row.renders)}/${rows.length}`,
        "",
        "",
        `${sum((row) => row.reference)} with a reference picture from Qt`,
      ],
    ];
    const widths = lines[0].map((_, column) => Math.max(...lines.map((line) => line[column].length)));
    const columns = process.stdout.columns ?? 160;
    console.log();
    lines.forEach((line, index) => {
      if (index === lines.length - 1) console.log();
      const cells = line.map((cell, column) => (column === 0 || column === 6 ? cell.padEnd(widths[column]) : cell.padStart(widths[column])));
      const text = cells.join("  ").trimEnd();
      console.log(text.length > columns ? text.slice(0, columns - 1) + "…" : text);
      if (index === 0) console.log();
    });
    console.log();
    console.log("files: .qml files qmlc takes; entry: the entry file is one; renders: the page shows it with no error;");
    console.log("pixels: pixels the same as in Qt's picture; content: the same, not counting background.");
    console.log(`pictures and the whole report: ${join(reportDirectory, "index.html")}`);

    writeFileSync(join(reportDirectory, "report.json"), JSON.stringify(rows, null, 2) + "\n");
    writeFileSync(join(reportDirectory, "index.html"), page(rows));

    if (process.env.GALLERY_RATCHET) {
      const expected = readExpected();
      const added = rows.filter((row) => row.renders && !(row.id in expected.examples)).map((row) => row.id);
      for (const id of added) expected.examples[id] = {};
      expected.examples = Object.fromEntries(Object.entries(expected.examples).sort(([a], [b]) => a.localeCompare(b)));
      writeFileSync(expectedFile, JSON.stringify(expected, null, 2) + "\n");
      console.log(`${expectedFile}: ${added.length ? `added ${added.join(", ")}` : "nothing new renders"}`);
    }

    if (this.failures.length) {
      console.log();
      console.log("FAILED:");
      for (const failure of this.failures) console.log(`  ${failure}`);
    }
    console.log();
  }
}

function page(rows) {
  const picture = (row, kind) =>
    existsSync(join(reportDirectory, `${row.id}.${kind}.png`))
      ? `<a href="${escape(row.id)}.${kind}.png"><img src="${escape(row.id)}.${kind}.png"></a>`
      : "";
  const body = rows
    .map(
      (row) => `<tr>
  <td><b>${escape(row.id)}</b><br>${escape(row.entry)}<br>${row.window.width}x${row.window.height}</td>
  <td>${row.compiled}/${row.files}<br>entry: ${yes(row.entryCompiles)}<br>renders: ${yes(row.renders)}<br>pixels: ${score(row, "pixels")}<br>content: ${score(row, "content")}</td>
  <td>${picture(row, "web")}</td>
  <td>${picture(row, "qt") || `<i>${escape(row.qt ?? "no reference picture")}</i>`}</td>
  <td>${picture(row, "diff")}</td>
  <td><pre>${escape(row.error ?? row.mismatch ?? "")}</pre></td>
  <td><pre>${escape((row.said ?? []).map(({ text, times }) => (times > 1 ? `${times}x ` : "") + text.split("\n")[0]).join("\n"))}</pre></td>
</tr>`,
    )
    .join("\n");
  return `<!doctype html>
<meta charset="utf-8">
<title>ljos-web: Qt's examples, web against Qt</title>
<style>
  body { font: 13px/1.4 system-ui, sans-serif; margin: 16px; }
  table { border-collapse: collapse; }
  th, td { text-align: left; vertical-align: top; padding: 8px; border-bottom: 1px solid #ddd; }
  img { max-width: 300px; max-height: 300px; border: 1px solid #ccc; }
  pre { white-space: pre-wrap; max-width: 420px; margin: 0; font-size: 11px; }
  i { color: #777; display: block; max-width: 300px; }
</style>
<table>
<tr><th>example</th><th>report</th><th>web</th><th>Qt</th><th>difference</th><th>what stops it</th><th>what it warns of</th></tr>
${body}
</table>
`;
}
