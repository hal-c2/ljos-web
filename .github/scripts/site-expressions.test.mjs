// What site.yml decides for each way a run can start: its concurrency
// group, whether it deploys, and whether the freshness guard runs and
// may be rolled past. The expressions are read out of the workflow and
// evaluated here, so a change to one that changes a decision fails a
// test rather than a deploy.
//
// `node --test .github/scripts/site-expressions.test.mjs` checks them;
// `node .github/scripts/site-expressions.test.mjs table` prints the
// table the README and pull requests carry.

import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const workflow = readFileSync(new URL("../workflows/site.yml", import.meta.url), "utf8");
const lines = workflow.split("\n");

// --- reading the workflow -------------------------------------------
// The keys looked for are few and each stands on one line, so lines
// and their indentation are enough; no YAML library is needed.

const indent = (line) => line.length - line.trimStart().length;

// The lines from `start` up to the next one indented `depth` or less.
function block(start, depth) {
  let end = start + 1;
  while (end < lines.length && (lines[end].trim() === "" || indent(lines[end]) > depth)) end++;
  return [start, end];
}

function job(name) {
  const start = lines.findIndex((l) => l === `  ${name}:`);
  assert.notEqual(start, -1, `site.yml has no job ${name}`);
  return block(start, 2);
}

// A step of a job, found by its `id:` or `name:`.
function step([from, to], key, value) {
  for (let i = from; i < to; i++) {
    if (!/^ {6}- /.test(lines[i])) continue;
    const [s, e] = block(i, 6);
    if (lines.slice(s, e).some((l) => l.replace(/^ {6}- /, "        ").trim() === `${key}: ${value}`)) {
      return [s, e];
    }
  }
  assert.fail(`site.yml has no step with ${key}: ${value}`);
}

// The expression a key holds within a range, or undefined when the key
// is absent there (a step with no `if:` always runs).
function expr([from, to], key, depth) {
  for (let i = from; i < to; i++) {
    const line = lines[i].replace(/^( *)- /, "$1  ");
    if (indent(line) !== depth) continue;
    const m = line.trim().match(new RegExp(`^${key}: \\$\\{\\{ (.*) \\}\\}$`));
    if (m) return m[1];
  }
  return undefined;
}

const top = [0, lines.findIndex((l) => l === "jobs:")];
const build = job("build");
const deploy = job("deploy");
const at = {
  group: expr(top, "group", 2),
  cancel: expr(top, "cancel-in-progress", 2),
  deploys: expr(build, "SITE_DEPLOYS", 6),
  domain: expr(build, "SITE_CUSTOM_DOMAIN", 6),
  buildGuard: step(build, "id", "fresh"),
  pages: step(build, "id", "pages"),
  upload: step(build, "uses", "actions/upload-pages-artifact@56afc609e74202658d3ffba0e8f6dda462b719fa # v3"),
  deployIf: expr(deploy, "if", 4),
  deployGuard: step(deploy, "id", "fresh"),
};

// --- evaluating GitHub's expression language --------------------------
// The part of it site.yml uses: literals, property paths, !, ==, !=,
// &&, || (which yield an operand, not a boolean), parentheses and
// format().

function tokens(src) {
  const out = [];
  const re = /\s*(?:('(?:[^']|'')*')|(==|!=|&&|\|\||[!(),])|([A-Za-z_][\w.-]*(?:\.[\w-]+)*)|(\d+))/y;
  let m;
  while (re.lastIndex < src.length && (m = re.exec(src))) {
    if (m[1]) out.push({ str: m[1].slice(1, -1).replace(/''/g, "'") });
    else if (m[2]) out.push({ op: m[2] });
    else if (m[3]) out.push({ id: m[3] });
    else out.push({ num: Number(m[4]) });
  }
  assert.equal(src.slice(re.lastIndex).trim(), "", `cannot read the expression at: ${src.slice(re.lastIndex)}`);
  return out;
}

const truthy = (v) => !(v === false || v === null || v === undefined || v === 0 || v === "");
const number = (v) => (v === null || v === undefined ? 0 : typeof v === "boolean" ? Number(v) : Number(v));

// GitHub compares strings ignoring case, and values of different types
// as numbers.
function equal(a, b) {
  a ??= null;
  b ??= null;
  if (typeof a === "string" && typeof b === "string") return a.toLowerCase() === b.toLowerCase();
  if (typeof a === typeof b) return a === b;
  return number(a) === number(b);
}

const lookup = (ctx, path) => path.split(".").reduce((o, k) => (o == null ? null : o[k] ?? null), ctx);

function evaluate(src, ctx) {
  const ts = tokens(src);
  let i = 0;
  const peek = (op) => ts[i]?.op === op;
  const take = (op) => {
    assert.ok(peek(op), `expected ${op} in ${src}`);
    i++;
  };
  function or() {
    let v = and();
    while (peek("||")) {
      i++;
      const r = and();
      v = truthy(v) ? v : r;
    }
    return v;
  }
  function and() {
    let v = not();
    while (peek("&&")) {
      i++;
      const r = not();
      v = truthy(v) ? r : v;
    }
    return v;
  }
  function not() {
    if (peek("!")) {
      i++;
      return !truthy(not());
    }
    return compare();
  }
  function compare() {
    const v = primary();
    if (peek("==") || peek("!=")) {
      const op = ts[i++].op;
      const r = primary();
      return op === "==" ? equal(v, r) : !equal(v, r);
    }
    return v;
  }
  function primary() {
    const t = ts[i++];
    if (t.op === "(") {
      const v = or();
      take(")");
      return v;
    }
    if ("str" in t) return t.str;
    if ("num" in t) return t.num;
    if (t.id === "true") return true;
    if (t.id === "false") return false;
    if (t.id === "null") return null;
    if (peek("(")) {
      i++;
      const args = [];
      while (!peek(")")) {
        args.push(or());
        if (peek(",")) i++;
      }
      take(")");
      assert.equal(t.id, "format", `the evaluator knows format() only, not ${t.id}()`);
      return args[0].replace(/\{(\d+)\}/g, (_, n) => String(args[Number(n) + 1] ?? ""));
    }
    return lookup(ctx, t.id);
  }
  const v = or();
  assert.equal(i, ts.length, `left over in ${src}`);
  return v;
}

// An expression in an env value or an output becomes a string.
const asString = (v) => (v === null || v === undefined ? "" : String(v));

// --- the runs ----------------------------------------------------------

const MAIN = "refs/heads/main";
const BRANCH = "refs/heads/site3/preview";
const runs = [
  { name: "pull request", event: "pull_request", ref: "refs/pull/7/merge" },
  { name: "push to main", event: "push", ref: MAIN },
  { name: "push to a fork's main", event: "push", ref: MAIN, repo: "someone/ljos-web" },
  { name: "dispatch, deploy off", event: "workflow_dispatch", ref: MAIN, inputs: { deploy: false, custom_domain: false, rollback: false } },
  { name: "dispatch from main, preview", event: "workflow_dispatch", ref: MAIN, inputs: { deploy: true, custom_domain: false, rollback: false } },
  { name: "dispatch from main, custom_domain", event: "workflow_dispatch", ref: MAIN, inputs: { deploy: true, custom_domain: true, rollback: false } },
  { name: "dispatch from main, custom_domain, rollback", event: "workflow_dispatch", ref: MAIN, inputs: { deploy: true, custom_domain: true, rollback: true } },
  { name: "dispatch from a branch, preview", event: "workflow_dispatch", ref: BRANCH, inputs: { deploy: true, custom_domain: false, rollback: false } },
  { name: "dispatch from a branch, preview, rollback", event: "workflow_dispatch", ref: BRANCH, inputs: { deploy: true, custom_domain: false, rollback: true } },
  { name: "dispatch from a branch, custom_domain", event: "workflow_dispatch", ref: BRANCH, inputs: { deploy: true, custom_domain: true, rollback: false } },
  { name: "dispatch from a branch, custom_domain, rollback", event: "workflow_dispatch", ref: BRANCH, inputs: { deploy: true, custom_domain: true, rollback: true } },
];

// A step runs when its job runs and its `if:` (success() by default)
// holds; the steps here are reached only when every step before them
// passed, so success() is true.
function stepRuns(range, ctx) {
  const cond = expr(range, "if", 8);
  return cond === undefined || truthy(evaluate(cond, ctx));
}

function stepEnv(range, ctx) {
  const env = {};
  for (let i = range[0]; i < range[1]; i++) {
    const m = lines[i].match(/^ {10}([A-Z_]+): \$\{\{ (.*) \}\}$/);
    if (m) env[m[1]] = asString(evaluate(m[2], ctx));
  }
  return env;
}

function decide(run) {
  const github = {
    event_name: run.event,
    ref: run.ref,
    repository: run.repo ?? "hal-c2/ljos-web",
    run_id: 42,
    token: "token",
  };
  // A pull request or a push has no inputs: each reads as null.
  const base = { github, inputs: run.inputs ?? {} };
  const env = {
    SITE_DEPLOYS: asString(evaluate(at.deploys, base)),
    SITE_CUSTOM_DOMAIN: asString(evaluate(at.domain, base)),
  };
  const ctx = { ...base, env };
  const deployJob = truthy(evaluate(at.deployIf, { ...base, needs: { build: { outputs: { deploy: env.SITE_DEPLOYS } } } }));
  return {
    group: asString(evaluate(at.group, base)),
    cancel: truthy(evaluate(at.cancel, base)),
    deploys: env.SITE_DEPLOYS === "true",
    customDomain: env.SITE_CUSTOM_DOMAIN === "true",
    buildGuard: stepRuns(at.buildGuard, ctx),
    buildGuardEnv: stepEnv(at.buildGuard, ctx),
    pages: stepRuns(at.pages, ctx),
    pagesEnv: stepEnv(at.pages, ctx),
    upload: stepRuns(at.upload, ctx),
    deployJob,
    deployGuard: deployJob && stepRuns(at.deployGuard, ctx),
    deployGuardEnv: stepEnv(at.deployGuard, ctx),
  };
}

const deploying = (run) => decide(run).deploys;

// --- what must hold ------------------------------------------------------

test("a pull request never deploys and never reaches the guard", () => {
  const d = decide(runs[0]);
  assert.equal(d.deploys, false);
  assert.equal(d.buildGuard, false);
  assert.equal(d.pages, false);
  assert.equal(d.upload, false);
  assert.equal(d.deployJob, false);
  assert.equal(d.deployGuard, false);
  assert.equal(d.cancel, true, "a newer push supersedes a pull request's run");
});

test("the runs that deploy are a push to main here and a dispatch with deploy on", () => {
  assert.deepEqual(
    runs.filter(deploying).map((r) => r.name),
    runs.filter((r) => (r.event === "push" && !r.repo) || r.inputs?.deploy).map((r) => r.name),
  );
});

test("every deploying run checks freshness before upload and again before deploy-pages", () => {
  for (const run of runs.filter(deploying)) {
    const d = decide(run);
    assert.ok(d.buildGuard, `${run.name}: the guard does not run before upload`);
    assert.ok(d.upload, `${run.name}: deploys without uploading`);
    assert.ok(d.deployGuard, `${run.name}: the guard does not run before deploy-pages`);
    assert.ok(at.buildGuard[0] > at.pages[0] && at.buildGuard[0] < at.upload[0], "the build's guard is not the last step before upload");
  }
});

test("a run that does not deploy never checks freshness", () => {
  for (const run of runs.filter((r) => !deploying(r))) {
    const d = decide(run);
    assert.equal(d.buildGuard, false, run.name);
    assert.equal(d.deployGuard, false, run.name);
  }
});

test("rollback is on only where a dispatch asks for it, and both guards read it", () => {
  for (const run of runs.filter(deploying)) {
    const d = decide(run);
    const want = String(run.inputs?.rollback === true);
    assert.equal(d.buildGuardEnv.ROLLBACK, want, `${run.name}: build guard`);
    assert.equal(d.deployGuardEnv.ROLLBACK, want, `${run.name}: deploy guard`);
    assert.equal(d.pagesEnv.ROLLBACK, want, `${run.name}: pages step`);
  }
});

test("a deploying run is never cancelled once running", () => {
  for (const run of runs.filter(deploying)) assert.equal(decide(run).cancel, false, run.name);
});

test("main's deploys and a rollback to the domain take turns in one group; other dispatches stand alone", () => {
  const group = (name) => decide(runs.find((r) => r.name === name)).group;
  for (const name of [
    "push to main",
    "dispatch from main, preview",
    "dispatch from main, custom_domain",
    "dispatch from main, custom_domain, rollback",
    "dispatch from a branch, custom_domain, rollback",
  ]) {
    assert.equal(group(name), "site-deploy", name);
  }
  for (const name of ["dispatch, deploy off", "dispatch from a branch, preview", "dispatch from a branch, preview, rollback", "dispatch from a branch, custom_domain"]) {
    assert.equal(group(name), "site-dispatch-42", name);
  }
  assert.equal(group("pull request"), "site-refs/pull/7/merge");
  assert.equal(group("push to a fork's main"), "site-refs/heads/main");
});

test("both path filters are the guard's list of what the site is built from", () => {
  const listed = readFileSync(new URL("./site-paths.txt", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l !== "" && !l.startsWith("#"));
  const filters = lines.filter((l) => /^ {4}paths: \[/.test(l)).map((l) => JSON.parse(l.trim().slice("paths: ".length)));
  assert.equal(filters.length, 2, "site.yml has a path filter on pull_request and on push");
  for (const filter of filters) assert.deepEqual(filter, listed);
  // fresh-head.sh matches a directory by prefix and a file exactly;
  // any other glob it would misread.
  for (const path of listed) assert.match(path, /^[^*?[\]!]+(\/\*\*)?$/, `fresh-head.sh cannot match ${path}`);
});

// --- the table -------------------------------------------------------------

const yes = (b) => (b ? "yes" : "no");
function table() {
  const rows = [
    "| Run | group | cancels | deploys | custom domain | guard before upload | guard before deploy-pages | ROLLBACK |",
    "|---|---|---|---|---|---|---|---|",
  ];
  for (const run of runs) {
    const d = decide(run);
    rows.push(
      `| ${run.name} | \`${d.group}\` | ${yes(d.cancel)} | ${yes(d.deploys)} | ${yes(d.customDomain)} | ${d.buildGuard ? "runs" : "skipped"} | ${d.deployGuard ? "runs" : "skipped"} | ${d.buildGuard ? d.buildGuardEnv.ROLLBACK : "—"} |`,
    );
  }
  return rows.join("\n");
}

if (process.argv.includes("table")) console.log(table());
