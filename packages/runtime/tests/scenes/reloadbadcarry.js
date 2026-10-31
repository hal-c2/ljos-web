// What cannot be paired with the old tree: `carry` walks what it holds.
import { onCleanup } from "solid-js";
import { Rectangle } from "ljos-web/QtQuick";

export default function ReloadBadCarry(props) {
  onCleanup(() => (window.gone = (window.gone ?? 0) + 1));
  const object = Rectangle({ objectName: "new" });
  Object.defineProperty(object, "$born", {
    get() {
      throw new Error("carried badly");
    },
  });
  return object;
}
