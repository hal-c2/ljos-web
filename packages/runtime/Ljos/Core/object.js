// `Object`: Ljós's name for `QtObject`, the plainest thing a file can
// declare. It has a module of its own, bound here under another name, so
// that no code beside it reads JavaScript's `Object` as this type; a file
// that imports it gets it as `Object` all the same.
import { defineType, QtObject } from "../../object.ts";

const LjosObject = defineType("Object", QtObject, {});

export { LjosObject as Object };
