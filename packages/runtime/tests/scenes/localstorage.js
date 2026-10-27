// import QtQuick
// import QtQuick.LocalStorage
// Item { id: root; width: 100; height: 100 }
//
// What a program does with `LocalStorage` it does in JavaScript: the tests
// do the same with what the module exports.
import { LocalStorage, saved } from "ljos-web/QtQuick/LocalStorage";
import { Item } from "ljos-web/QtQuick";
import { make } from "../scene.js";

export const objects = { LocalStorage, saved };

export default function Stored() {
  return make(Item, { width: 100, height: 100 });
}
