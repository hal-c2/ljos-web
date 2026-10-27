// Item {
//     id: root; width: 400; height: 300
//     property int count: 2
//     property string label: qsTr("%1 of %n", "", count).arg(1)
//     Rectangle { id: bar; width: 10; height: 10; color: Qt.rgba(0, 0, 1, 1) }
//     Rectangle { id: follower; y: 20; width: 5; height: 10 }
// }
import { $define, $object, $signal } from "ljos-web/object";
import { Component, gc, Locale, print, qsTr, qsTrId, qsTranslate, Qt, QT_TR_NOOP, QT_TRANSLATE_NOOP, QT_TRID_NOOP } from "ljos-web/QtQml";
import { Application, Item, Rectangle } from "ljos-web/QtQuick";
import { make } from "../scene.js";

export const objects = {
  Application,
  Component,
  gc,
  Locale,
  print,
  qsTr,
  qsTrId,
  qsTranslate,
  Qt,
  QT_TR_NOOP,
  QT_TRANSLATE_NOOP,
  QT_TRID_NOOP,
};

export default function Globals() {
  const root = (objects.root = $object());
  const bar = (objects.bar = $object());
  const follower = (objects.follower = $object());
  const [count, setCount] = $signal(2);
  const [label, setLabel] = $signal(() => qsTr("%1 of %n", "", count()).arg(1));
  const made = make(Item, { $self: root, width: 400, height: 300 }, () => [
    make(Rectangle, {
      $self: bar,
      width: 10,
      height: 10,
      get color() {
        return Qt.rgba(0, 0, 1, 1);
      },
    }),
    make(Rectangle, { $self: follower, y: 20, width: 5, height: 10 }),
  ]);
  return $define(made, { count: [count, setCount], label: [label, setLabel] });
}
