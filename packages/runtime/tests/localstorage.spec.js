import { expect, open, test } from "./open.js";

// What a test kept is deleted: the next finds no database.
test.afterEach(async ({ page }) => {
  await page.evaluate(async () => {
    await window.objects.saved();
    await new Promise((resolve) => {
      const deleting = indexedDB.deleteDatabase("ljos-web.LocalStorage");
      deleting.onsuccess = deleting.onerror = deleting.onblocked = resolve;
    });
  });
});

// Runs `work` in the page with `attempt`: what a call returns, or the
// message and code of what it throws.
const run = (page, work) =>
  page.evaluate(
    ([source]) => {
      const attempt = (call) => {
        try {
          return call();
        } catch (error) {
          return { threw: error.message, code: error.code };
        }
      };
      return new Function("LocalStorage", "attempt", `return (${source})(LocalStorage, attempt)`)(
        window.objects.LocalStorage,
        attempt,
      );
    },
    [work.toString()],
  );

test("a database is made once, with the version its maker gives it", async ({ page }) => {
  await open(page, "localstorage");
  const read = await run(page, (LocalStorage, attempt) => {
    const made = [];
    const db = LocalStorage.openDatabaseSync("versions", "1.0", "a test", 1000, (fresh) => made.push(fresh.version));
    const seen = { fresh: [db.version, made, Object.keys(db).sort()] };
    seen.wrong = attempt(() => db.changeVersion("9", "2", () => {}));
    db.changeVersion("", "1.0", (tx) => tx.executeSql("CREATE TABLE t(a)"));
    // Made already: nobody is asked to make it, and any handle sees its version.
    const again = LocalStorage.openDatabaseSync("versions", "1.0", "a test", 1000, () => made.push("again"));
    seen.changed = [db.version, again.version, made.length];
    seen.any = LocalStorage.openDatabaseSync("versions", "", "", 0).version;
    seen.other = attempt(() => LocalStorage.openDatabaseSync("versions", "2.0", "", 0));
    // Without a maker the version is the one asked for.
    seen.plain = LocalStorage.openDatabaseSync("plain", "3").version;
    db.changeVersion("1.0", "2.0");
    seen.bare = [db.version, attempt(() => LocalStorage.openDatabaseSync("versions", "1.0").version)];
    // A maker that fails has still made it.
    seen.failed = attempt(() =>
      LocalStorage.openDatabaseSync("failed", "1", "", 0, () => {
        throw new Error("no");
      }),
    );
    seen.after = LocalStorage.openDatabaseSync("failed", "1", "", 0, () => made.push("never")).version;
    seen.made = made.length;
    db.version = "x";
    seen.readonly = db.version;
    return seen;
  });
  expect(read).toEqual({
    fresh: ["", [""], ["changeVersion", "readTransaction", "transaction", "version"]],
    wrong: { threw: "Version mismatch: expected 9, found ", code: 3 },
    changed: ["1.0", "1.0", 1],
    any: "1.0",
    other: { threw: "SQL: database version mismatch", code: 3 },
    plain: "3",
    bare: ["2.0", { threw: "SQL: database version mismatch", code: 3 }],
    failed: { threw: "no" },
    after: "",
    made: 1,
    readonly: "2.0",
  });
});

test("executeSql gives rows, how many it changed and the last one inserted", async ({ page }) => {
  await open(page, "localstorage");
  const read = await run(page, (LocalStorage, attempt) => {
    const db = LocalStorage.openDatabaseSync("rows", "1", "", 0);
    const seen = {};
    db.transaction((tx) => {
      tx.executeSql("CREATE TABLE IF NOT EXISTS t(a, b TEXT, c REAL)");
      const none = tx.executeSql("SELECT * FROM t");
      seen.none = [none.rowsAffected, none.insertId, none.rows.length, Object.keys(none)];
      const first = tx.executeSql("INSERT INTO t VALUES(?, ?, ?)", [1, "one", 1.5]);
      seen.insert = [first.rowsAffected, first.insertId, first.rows.length];
      // What is given is what Qt's driver would have made of it.
      tx.executeSql("INSERT INTO t VALUES(?, ?, ?)", [true, undefined, null]);
      tx.executeSql("INSERT INTO t VALUES(?, ?, ?)", [new Date(2024, 0, 2, 3, 4, 5, 6), [1, 2], { x: 1 }]);
      tx.executeSql("INSERT INTO t VALUES(:a, :b, :c)", { ":a": 7, ":b": "named", ":c": 2 });
      // A name that is not in the statement is bound to nothing.
      tx.executeSql("INSERT INTO t VALUES(:a, :b, :c)", { a: 8, b: "bare", c: 3 });
      seen.single = tx.executeSql("INSERT INTO t VALUES(?, 'x', 0)", 9).insertId;
      seen.few = attempt(() => tx.executeSql("INSERT INTO t VALUES(?, ?, ?)", [10]));
      seen.many = attempt(() => tx.executeSql("INSERT INTO t VALUES(?, 'm', 0)", [11, 12]));
      seen.unbound = attempt(() => tx.executeSql("INSERT INTO t VALUES(?, 'm', 0)"));
      const all = tx.executeSql("SELECT * FROM t");
      // A query leaves the counts of the statement before it.
      seen.select = [all.rowsAffected, all.insertId, all.rows.length];
      seen.rows = Array.from({ length: all.rows.length }, (_, index) => all.rows.item(index));
      seen.index = [all.rows[0] === all.rows.item(0), all.rows.item(99), all.rows.item(-1)];
      // What samegame asks: a text in double quotes.
      seen.quoted = tx.executeSql('SELECT a, b AS bee, a + 1, count(*) FROM t WHERE b = "one"').rows.item(0);
      const update = tx.executeSql("UPDATE t SET c = 5 WHERE a < 100");
      seen.update = [update.rowsAffected, update.insertId, update.rows.length];
      seen.delete = tx.executeSql("DELETE FROM t WHERE a = 9").rowsAffected;
      seen.ordered = tx.executeSql("SELECT a FROM t WHERE a IS NOT NULL ORDER BY a DESC LIMIT 1").rows.item(0);
      const types = tx.executeSql("SELECT x'0102' AS blob, 1.0 AS one, NULL AS nul, ? AS t, ? AS f, typeof(?) AS kind", [true, false, true]).rows.item(0);
      seen.types = [types.blob instanceof ArrayBuffer, [...new Uint8Array(types.blob)], types.one, types.nul, types.t, types.f, types.kind];
      seen.syntax = attempt(() => tx.executeSql("SELEC nothing"));
      seen.missing = attempt(() => tx.executeSql("SELECT * FROM missing"));
      seen.several = attempt(() => tx.executeSql("INSERT INTO t VALUES(20,'a',0); INSERT INTO t VALUES(21,'b',0)"));
      seen.comment = attempt(() => tx.executeSql("SELECT 1 AS n; -- done"));
      seen.semicolon = tx.executeSql("SELECT 1 AS n;  ").rows.length;
      seen.empty = attempt(() => tx.executeSql(""));
      tx.executeSql("CREATE TABLE u(a INTEGER PRIMARY KEY, b TEXT UNIQUE)");
      tx.executeSql("INSERT INTO u VALUES(1, 'c')");
      seen.constraint = attempt(() => tx.executeSql("INSERT INTO u VALUES(2, 'c')"));
      seen.count = tx.executeSql("SELECT count(*) AS n FROM t").rows.item(0).n;
    });
    return seen;
  });
  expect(read).toEqual({
    none: [0, "", 0, ["rowsAffected", "insertId", "rows"]],
    insert: [1, "1", 0],
    single: "6",
    few: { threw: "Parameter count mismatch", code: 2 },
    many: { threw: "Parameter count mismatch", code: 2 },
    unbound: { threw: "Parameter count mismatch", code: 2 },
    select: [1, "6", 6],
    rows: [
      { a: 1, b: "one", c: 1.5 },
      { a: 1, b: null, c: null },
      { a: "2024-01-02T03:04:05.006", b: "", c: "" },
      { a: 7, b: "named", c: 2 },
      { a: null, b: null, c: null },
      { a: 9, b: "x", c: 0 },
    ],
    index: [true, undefined, undefined],
    quoted: { a: 1, bee: "one", "a + 1": 2, "count(*)": 1 },
    update: [4, "6", 0],
    delete: 1,
    ordered: { a: "2024-01-02T03:04:05.006" },
    types: [true, [1, 2], 1, null, 1, 0, "integer"],
    syntax: { threw: 'near "SELEC": syntax error Unable to execute statement', code: 2 },
    missing: { threw: "no such table: missing Unable to execute statement", code: 2 },
    several: { threw: "not an error Unable to execute multiple statements at a time", code: 2 },
    comment: { threw: "not an error Unable to execute multiple statements at a time", code: 2 },
    semicolon: 1,
    empty: { threw: "", code: 2 },
    constraint: { threw: "UNIQUE constraint failed: u.b Unable to fetch row", code: 2 },
    count: 5,
  });
});

test("a transaction is kept when it returns and undone when it throws", async ({ page }) => {
  await open(page, "localstorage");
  const read = await run(page, (LocalStorage, attempt) => {
    const db = LocalStorage.openDatabaseSync("transactions", "1", "", 0);
    const count = () => {
      let rows;
      db.readTransaction((tx) => {
        rows = tx.executeSql("SELECT count(*) AS n FROM t").rows.item(0).n;
      });
      return rows;
    };
    const seen = {};
    seen.returns = db.transaction((tx) => tx.executeSql("CREATE TABLE t(a INTEGER PRIMARY KEY, b TEXT)"));
    seen.thrown = attempt(() =>
      db.transaction((tx) => {
        tx.executeSql("INSERT INTO t VALUES(1, 'undone')");
        throw new Error("boom");
      }),
    );
    seen.failed = attempt(() =>
      db.transaction((tx) => {
        tx.executeSql("INSERT INTO t VALUES(2, 'undone')");
        tx.executeSql("INSERT INTO nope VALUES(1)");
      }),
    );
    seen.undone = count();
    // An error the program catches undoes nothing.
    db.transaction((tx) => {
      tx.executeSql("INSERT INTO t VALUES(3, 'kept')");
      attempt(() => tx.executeSql("INSERT INTO nope VALUES(1)"));
    });
    seen.kept = count();
    seen.readonly = [
      attempt(() => db.readTransaction((tx) => tx.executeSql("INSERT INTO t VALUES(4, 'r')"))),
      attempt(() => db.readTransaction((tx) => tx.executeSql("PRAGMA user_version"))),
      attempt(() => db.readTransaction((tx) => tx.executeSql("  select 1"))),
      attempt(() => db.readTransaction((tx) => tx.executeSql("select 1 as n"))),
    ];
    seen.outside = attempt(() => {
      let held;
      db.transaction((tx) => {
        held = tx;
      });
      return held.executeSql("SELECT 1");
    });
    seen.missing = [attempt(() => db.transaction()), attempt(() => db.readTransaction())];
    // One inside another is part of it: what undoes the outer undoes both.
    seen.nested = attempt(() =>
      db.transaction((tx) => {
        tx.executeSql("INSERT INTO t VALUES(5, 'outer')");
        db.transaction((inner) => inner.executeSql("INSERT INTO t VALUES(6, 'inner')"));
        throw new Error("both");
      }),
    );
    seen.afterNested = count();
    // A version is changed with what its transaction did, or not at all.
    seen.version = attempt(() =>
      db.changeVersion("1", "2", (tx) => {
        tx.executeSql("INSERT INTO t VALUES(7, 'version')");
        throw new Error("no");
      }),
    );
    seen.unchanged = [db.version, count()];
    // Another handle of the database sees the same rows.
    const other = LocalStorage.openDatabaseSync("transactions", "", "", 0);
    other.transaction((tx) => tx.executeSql("INSERT INTO t VALUES(8, 'other')"));
    seen.shared = count();
    // Rows are there after the transaction that read them.
    let rows;
    db.readTransaction((tx) => {
      rows = tx.executeSql("SELECT a, b FROM t ORDER BY a").rows;
    });
    seen.rows = [rows.length, rows.item(1)];
    return seen;
  });
  expect(read).toEqual({
    thrown: { threw: "boom" },
    failed: { threw: "no such table: nope Unable to execute statement", code: 2 },
    undone: 0,
    kept: 1,
    readonly: [
      { threw: "Read-only Transaction", code: 6 },
      { threw: "Read-only Transaction", code: 6 },
      { threw: "Read-only Transaction", code: 6 },
      undefined,
    ],
    outside: { threw: "executeSql called outside transaction()", code: 2 },
    missing: [
      { threw: "transaction: missing callback", code: 1 },
      { threw: "readTransaction: missing callback", code: 1 },
    ],
    nested: { threw: "both" },
    afterNested: 1,
    version: { threw: "no" },
    unchanged: ["1", 1],
    shared: 2,
    rows: [2, { a: 8, b: "other" }],
  });
});

test("a database is there again when the page is opened again", async ({ page }) => {
  await open(page, "localstorage");
  await page.evaluate(async () => {
    const { LocalStorage, saved } = window.objects;
    const db = LocalStorage.openDatabaseSync("SameGame", "2.0", "SameGame Local Data", 100);
    db.transaction((tx) => {
      tx.executeSql("CREATE TABLE IF NOT EXISTS Scores(game TEXT, score NUMBER, gridSize TEXT, time NUMBER)");
      tx.executeSql("INSERT INTO Scores VALUES(?, ?, ?, ?)", ["Endless", 120, "10x10", 30]);
      tx.executeSql("INSERT INTO Scores VALUES(?, ?, ?, ?)", ["Endless", 90, "10x10", 20]);
    });
    // Undone, so not kept either.
    try {
      db.transaction((tx) => {
        tx.executeSql("INSERT INTO Scores VALUES(?, ?, ?, ?)", ["Endless", 999, "10x10", 1]);
        throw new Error("undone");
      });
    } catch {
      // As a program would.
    }
    LocalStorage.openDatabaseSync("Empty", "", "", 0, (fresh) => fresh.changeVersion("", "0.1"));
    await saved();
  });
  await open(page, "localstorage");
  const read = await page.evaluate(async () => {
    const { LocalStorage, saved } = window.objects;
    const made = [];
    const db = LocalStorage.openDatabaseSync("SameGame", "2.0", "SameGame Local Data", 100, () => made.push("again"));
    let rows;
    db.readTransaction((tx) => {
      rows = tx.executeSql('SELECT * FROM Scores WHERE gridSize = "10x10" ORDER BY score DESC').rows;
    });
    const seen = {
      version: db.version,
      made,
      rows: [rows.length, rows.item(0)],
      empty: LocalStorage.openDatabaseSync("Empty", "0.1", "", 0).version,
      other: (() => {
        try {
          return LocalStorage.openDatabaseSync("SameGame", "1.0", "", 0).version;
        } catch (error) {
          return error.code;
        }
      })(),
    };
    await saved();
    return seen;
  });
  expect(read).toEqual({
    version: "2.0",
    made: [],
    rows: [2, { game: "Endless", score: 120, gridSize: "10x10", time: 30 }],
    empty: "0.1",
    other: 3,
  });
});
