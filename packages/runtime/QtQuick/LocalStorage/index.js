// `import QtQuick.LocalStorage`: SQL databases that stay with the browser.
//
// QML's API is synchronous and its SQL is SQLite's, so the databases are
// SQLite's own, compiled for the browser (sql.js), held in memory and written
// to IndexedDB when a transaction has changed one. Both take time to be
// there, which only this module waits for: a program that does not import
// it loads neither.
import initSqlJs from "sql.js";
import wasm from "sql.js/dist/sql-wasm-browser.wasm?url";

// What an error's `code` says, as Qt numbers them.
const UNKNOWN_ERR = 1;
const DATABASE_ERR = 2;
const VERSION_ERR = 3;
const SYNTAX_ERR = 6;

const failure = (code, message) => Object.assign(new Error(message), { code });

// ------------------------------------------------------------------ keeping

const KEPT = "ljos-web.LocalStorage";
const STORE = "databases";

const done = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

// Runs `work` on the store and closes it again: nothing is held open, so
// the page may delete what is kept whenever it likes.
async function kept(mode, work) {
  const opening = indexedDB.open(KEPT, 1);
  opening.onupgradeneeded = () => opening.result.createObjectStore(STORE, { keyPath: "name" });
  const connection = await done(opening);
  try {
    const transaction = connection.transaction(STORE, mode);
    const result = await work(transaction.objectStore(STORE));
    if (mode === "readwrite") {
      await new Promise((resolve, reject) => {
        transaction.oncomplete = resolve;
        transaction.onabort = transaction.onerror = () => reject(transaction.error);
      });
    }
    return result;
  } finally {
    connection.close();
  }
}

function unkept(error) {
  console.warn(`LocalStorage: databases are not kept: ${error?.message ?? error}`);
}

const [SQL, records] = await Promise.all([
  initSqlJs({ locateFile: () => wasm }).catch((error) => {
    console.warn(`LocalStorage: SQLite could not be loaded: ${error?.message ?? error}`);
    return null;
  }),
  kept("readonly", (store) => done(store.getAll())).catch((error) => {
    unkept(error);
    return [];
  }),
]);

// The databases by name: what is kept of one and, once it was opened, the
// database itself.
const databases = new Map(records.map((record) => [record.name, { ...record, database: null, depth: 0 }]));

const changed = new Set();
let saving = Promise.resolve();

// Writes the databases that changed, once what changed them has returned.
function save(record) {
  if (!changed.size) {
    saving = saving
      .then(() => {
        const rows = [...changed].map(({ name, version, description, size, database }) => ({
          name,
          version,
          description,
          size,
          data: database.export(),
        }));
        changed.clear();
        return kept("readwrite", (store) => rows.forEach((row) => store.put(row)));
      })
      .catch(unkept);
  }
  changed.add(record);
}

// Resolves when every change so far is kept: for a page to wait for before
// it goes, and for tests.
export const saved = () => saving;

// ---------------------------------------------------------------------- SQL

const pad = (number, digits = 2) => String(number).padStart(digits, "0");

// A value as SQLite is given it, the way Qt's driver gives a QVariant.
function bound(value) {
  if (value == null) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" || typeof value === "string") return value;
  if (value instanceof Date) {
    const day = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    const time = `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
    return `${day}T${time}.${pad(value.getMilliseconds(), 3)}`;
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  return "";
}

const read = (value) =>
  value instanceof Uint8Array ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) : value;

const scalar = (database, sql) => database.exec(sql)[0].values[0][0];

// Changes when the database does: its rows, or what tables it has.
const stamp = (database) => `${scalar(database, "SELECT total_changes()")} ${scalar(database, "PRAGMA schema_version")}`;

// Whether the statement has exactly `count` parameters. SQLite refuses to
// bind one it does not have, which is the only way sql.js lets one ask (and
// it tells of a number only: a null it drops without a word).
function takes(statement, count) {
  try {
    statement.bind(new Array(count + 1).fill(0));
    return false;
  } catch {
    try {
      statement.bind(new Array(count).fill(0));
      return true;
    } catch {
      return false;
    }
  }
}

function execute(database, sql, values) {
  const statements = database.iterateStatements(String(sql));
  let statement;
  try {
    statement = statements.next().value;
  } catch (error) {
    throw failure(DATABASE_ERR, `${error.message} Unable to execute statement`);
  }
  if (!statement) throw failure(DATABASE_ERR, "");
  try {
    if (statements.getRemainingSQL().trim()) {
      throw failure(DATABASE_ERR, "not an error Unable to execute multiple statements at a time");
    }
    // A list is bound by position, an object by name (`:name`, as it is
    // written in the statement), anything else is the one value.
    const named = values !== null && typeof values === "object" && !Array.isArray(values) && !(values instanceof Date);
    if (named) {
      const given = {};
      for (const [name, value] of Object.entries(values)) given[name] = bound(value);
      statement.bind(given);
    } else {
      const given = (values === undefined ? [] : Array.isArray(values) ? values : [values]).map(bound);
      if (!takes(statement, given.length)) throw failure(DATABASE_ERR, "Parameter count mismatch");
      statement.bind(given);
    }
    const names = statement.getColumnNames();
    const rows = [];
    try {
      while (statement.step()) {
        const row = {};
        const cells = statement.get();
        for (let column = 0; column < names.length; column++) row[names[column]] = read(cells[column]);
        rows.push(row);
      }
    } catch (error) {
      throw failure(DATABASE_ERR, `${error.message} Unable to fetch row`);
    }
    Object.defineProperty(rows, "item", { value: (index) => rows[index] });
    // Of the last statement that changed or inserted rows, as SQLite keeps
    // them: a query leaves both as they were.
    const inserted = scalar(database, "SELECT last_insert_rowid()");
    return { rowsAffected: database.getRowsModified(), insertId: inserted ? String(inserted) : "", rows };
  } finally {
    // Frees the statement, and what the iterator holds.
    try {
      while (!statements.next().done);
    } catch {
      // What follows a statement need not be SQL.
    }
  }
}

// Runs `callback` with a transaction in which it may execute statements:
// kept if it returns, undone if it throws.
function transact(record, readonly, callback) {
  const { database } = record;
  // One inside another is part of it.
  const outer = record.depth > 0;
  const state = { open: true };
  const transaction = {
    executeSql(sql, values) {
      if (!state.open) throw failure(DATABASE_ERR, "executeSql called outside transaction()");
      if (readonly && !/^select/i.test(sql)) throw failure(SYNTAX_ERR, "Read-only Transaction");
      return execute(database, sql, values);
    },
  };
  const before = outer ? "" : stamp(database);
  if (!outer) database.run("BEGIN");
  record.depth++;
  try {
    callback(transaction);
  } catch (error) {
    if (!outer) database.run("ROLLBACK");
    throw error;
  } finally {
    record.depth--;
    state.open = false;
  }
  if (outer) return;
  database.run("COMMIT");
  if (stamp(database) !== before) save(record);
}

function handle(record) {
  return {
    get version() {
      return record.version;
    },
    // Read-only: an assignment changes nothing, and says nothing.
    set version(_) {},
    transaction(callback) {
      if (typeof callback !== "function") throw failure(UNKNOWN_ERR, "transaction: missing callback");
      transact(record, false, callback);
    },
    readTransaction(callback) {
      if (typeof callback !== "function") throw failure(UNKNOWN_ERR, "readTransaction: missing callback");
      transact(record, true, callback);
    },
    changeVersion(from, to, callback) {
      if (String(from) !== record.version) {
        throw failure(VERSION_ERR, `Version mismatch: expected ${from}, found ${record.version}`);
      }
      if (typeof callback === "function") transact(record, false, callback);
      record.version = String(to);
      save(record);
    },
  };
}

// `LocalStorage.openDatabaseSync(name, version, description, size, callback)`.
// A database made by this call is given to `callback`, with no version yet:
// that is where its tables are made and its version set.
function openDatabaseSync(name, version, description, size, callback) {
  if (!SQL) throw failure(DATABASE_ERR, "SQL: can't open database");
  name = String(name);
  version = String(version ?? "");
  let record = databases.get(name);
  const created = !record;
  if (created) {
    const made = typeof callback === "function";
    record = { name, version: made ? "" : version, description: String(description ?? ""), size: Number(size) || 0 };
    record.database = new SQL.Database();
    record.depth = 0;
    databases.set(name, record);
    save(record);
  } else if (version && record.version && version !== record.version) {
    throw failure(VERSION_ERR, "SQL: database version mismatch");
  }
  record.database ??= new SQL.Database(record.data);
  record.data = null;
  const database = handle(record);
  if (created && typeof callback === "function") callback(database);
  return database;
}

export const LocalStorage = { openDatabaseSync };
