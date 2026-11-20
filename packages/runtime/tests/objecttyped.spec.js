// A property typed with an object type takes an object of that type, or of
// one made from it, or null, and refuses anything else: an assignment
// throws, and a binding is told of and leaves the property as it was. The
// answers are Qt's own, from the same scene run by `qml6`.
import { expect, open, test } from "./open.js";

// Qt 6.11: a refusal names the type by its C++ class (`QQuickRectangle`),
// and a component's by a name it makes up (`ANON_QML_IC_Tile_0`). Ljós's
// compiler knows neither, and names each as it is written in QML.
const WRITTEN = { QQuickRectangle: "Rectangle", QQuickItem: "Item", ANON_QML_IC_Tile_0: "Tile" };
const QT = [
  "declared null null rect",
  "rect ok rect",
  "plain Cannot assign QObject* to QQuickRectangle* rect",
  "item Cannot assign QObject* to QQuickRectangle* rect",
  "tile ok made",
  "null ok null",
  "undefined Cannot assign [undefined] to QQuickRectangle* null",
  "number Cannot assign int to QQuickRectangle* null",
  "record Cannot assign QJSValue to QQuickRectangle* null",
  "any rect ok rect",
  "any timer Cannot assign QObject* to QQuickItem* rect",
  "loose timer ok timer",
  "loose rect ok rect",
  "tile made ok made",
  "tile rect Cannot assign QObject* to ANON_QML_IC_Tile_0* made",
  "alias plain Cannot assign QObject* to QQuickRectangle* null",
  "alias rect ok rect",
  "bound rect",
].map((line) => line.replace(/QQuickRectangle|QQuickItem|ANON_QML_IC_Tile_0/g, (name) => WRITTEN[name]));

// Qt 6.11 says `Unable to assign QObject to QQuickRectangle`.
const BOUND = /Unable to assign QObject to Rectangle$/;
test.use({ told: [BOUND] });

test("a property typed with an object type refuses an object of another type", async ({ page }) => {
  const warned = [];
  page.on("console", (message) => BOUND.test(message.text()) && warned.push(message.text()));
  await open(page, "objecttyped");
  expect(await page.evaluate(() => window.scene.run())).toEqual(QT);
  // `direct: plain` as it is made, and `chosen` once `k` makes it `plain`.
  expect(warned).toHaveLength(2);
});
