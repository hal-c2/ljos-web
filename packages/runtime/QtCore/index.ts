// `import QtCore`: Settings, kept in the browser's `localStorage`,
// StandardPaths, of which a page has none, and LocationPermission, which is
// the browser's to give.
import { onCleanup } from "solid-js";
import { mayKeep } from "../guard.js";
import { defineType, onChange, QtObject, settle, slot, whenComplete } from "../object.ts";
import { application } from "../QtQml/application.ts";
import { Color, color } from "../QtQuick/color.js";
import { untrack } from "#kernel";
import type { QObject } from "../object.ts";

// A Settings object: its own properties, and every one its QML declares,
// which are what it stores.
interface Store extends QObject {
  category: string;
  location: string;
  fileName: string;
  $key(name: string): string;
  [name: string]: unknown;
}

interface Permission extends QObject {
  status: number;
  accuracy: number;
}

// What was written since the page loaded, as it was written: Qt answers
// `value()` with that, and with text for what it read from storage.
const written = new Map<string, unknown>();

// Qt keeps settings as text: a number comes back as "4", a colour as its
// name, a list as a list of those.
function text(value: unknown): unknown {
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Color) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(text);
  return value;
}

// A stored value as the kind of thing the property holds now: what its
// declared type does in Qt.
function typed(stored: unknown, current: unknown): unknown {
  if (typeof stored !== "string") return stored;
  if (typeof current === "number") return Number(stored);
  if (typeof current === "boolean") return stored === "true";
  if (current instanceof Color) return color(stored);
  if (current instanceof Date) return new Date(stored);
  return stored;
}

function read(key: string): unknown {
  if (written.has(key)) return written.get(key);
  let stored: string | null;
  try {
    stored = localStorage.getItem(key);
  } catch {
    // Storage a page may not use is storage with nothing in it.
    return undefined;
  }
  if (stored === null) return undefined;
  try {
    return JSON.parse(stored);
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  written.set(key, value);
  // It may be a dropped shell's string, which the next page would act on with
  // no guard up: it lasts as long as this page.
  if (!mayKeep()) return;
  try {
    localStorage.setItem(key, JSON.stringify(text(value) ?? null));
  } catch {
    // Full or forbidden: the setting lasts as long as the page.
  }
}

// The properties an object declares beyond its type's: the ones its QML
// gives it, which is what a Settings object stores.
function declared(self: Store): string[] {
  const names = Object.keys(self).filter((name) => {
    const descriptor = Object.getOwnPropertyDescriptor(self, name);
    return descriptor!.get && descriptor!.set;
  });
  for (const name in self.$type.slots) {
    if (!(name in Settings.slots) && !name.includes("$")) names.push(name);
  }
  return names;
}

export const Settings = defineType("Settings", QtObject, {
  properties: {
    category: "",
    // Where the settings are kept: a name for another set of them.
    location: "",
    // The same, as `Qt.labs.settings` calls it.
    fileName: "",
  },
  methods: {
    value(this: Store, key: string, fallback?: unknown): unknown {
      return read(this.$key(key)) ?? fallback;
    },
    setValue(this: Store, key: string, value: unknown): void {
      write(this.$key(key), value);
    },
    // Every property is written when it changes, so this has nothing to
    // wait for: it writes them all.
    sync(this: Store): void {
      for (const name of declared(this)) write(this.$key(name), this[name]);
    },
    $key(this: Store, name: string): string {
      const { organization, name: program } = application();
      const where = [this.location || this.fileName, organization, program, this.category].filter(Boolean);
      return `ljos-web:${[...where, name].join("/")}`;
    },
  },
  setup(self: Store) {
    // Once the object has its properties and their bindings: what is stored
    // replaces what the QML says, and what the QML says is stored if
    // nothing was.
    whenComplete(() =>
      untrack(() => {
        for (const name of declared(self)) {
          const key = self.$key(name);
          const stored = read(key);
          if (stored === undefined) write(key, self[name]);
          else self[name] = typed(stored, self[name]);
          onChange(self, name, () => write(key, self[name]));
        }
      }),
    );
  },
});

// A page has no directories: every location is empty, nothing is found.
export const StandardPaths = Object.freeze({
  DesktopLocation: 0,
  DocumentsLocation: 1,
  FontsLocation: 2,
  ApplicationsLocation: 3,
  MusicLocation: 4,
  MoviesLocation: 5,
  PicturesLocation: 6,
  TempLocation: 7,
  HomeLocation: 8,
  AppLocalDataLocation: 9,
  CacheLocation: 10,
  GenericDataLocation: 11,
  RuntimeLocation: 12,
  ConfigLocation: 13,
  DownloadLocation: 14,
  GenericCacheLocation: 15,
  GenericConfigLocation: 16,
  AppDataLocation: 17,
  AppConfigLocation: 18,
  PublicShareLocation: 19,
  TemplatesLocation: 20,
  StateLocation: 21,
  GenericStateLocation: 22,
  LocateFile: 0,
  LocateDirectory: 1,
  writableLocation: () => "",
  standardLocations: () => [],
  locate: () => "",
  locateAll: () => [],
  findExecutable: () => "",
});

const UNDETERMINED = 0;
const GRANTED = 1;
const DENIED = 2;

// What the browser says of the page knowing where it is. A page has one
// answer, whatever accuracy is asked for and however many ask: every
// LocationPermission there is says the same.
let answer = UNDETERMINED;
let watched = false;
const permissions = new Set<Permission>();

function answered(status: number): void {
  answer = status;
  for (const self of permissions) slot(self, "status").write(status);
  settle();
}

const states: Record<PermissionState, number> = { granted: GRANTED, denied: DENIED, prompt: UNDETERMINED };

// The answer the browser has already, and every one it comes to later.
function watch(): void {
  if (watched) return;
  watched = true;
  if (!navigator.geolocation) return answered(DENIED);
  navigator.permissions?.query({ name: "geolocation" }).then(
    (permission) => {
      answered(states[permission.state]);
      permission.onchange = () => answered(states[permission.state]);
    },
    // A browser that does not say says so when asked.
    () => {},
  );
}

export const LocationPermission = defineType("LocationPermission", QtObject, {
  properties: {
    status: UNDETERMINED,
    accuracy: 0,
    availability: 0,
  },
  enums: { Approximate: 0, Precise: 1, WhenInUse: 0, Always: 1 },
  methods: {
    // Asking where the page is is how a browser is asked whether it may.
    request(this: Permission): void {
      if (untrack(() => this.status) !== UNDETERMINED || !navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        () => answered(GRANTED),
        // Not finding out where is not being forbidden to.
        (error) => answered(error.code === error.PERMISSION_DENIED ? DENIED : GRANTED),
        { enableHighAccuracy: untrack(() => this.accuracy) === 1 },
      );
    },
  },
  setup(self: Permission) {
    permissions.add(self);
    onCleanup(() => permissions.delete(self));
    slot(self, "status").write(answer);
    watch();
  },
});
