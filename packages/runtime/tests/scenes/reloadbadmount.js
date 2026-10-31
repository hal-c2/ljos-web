// What is put on the page and then cannot be told it is there; its theme is
// the page's until then. A failed reload ends it, and the theme is what it was.
import { onCleanup } from "solid-js";
import { Rectangle } from "ljos-web/QtQuick";
import { setTheme } from "ljos-web/theme";

export default function ReloadBadMount(props) {
  onCleanup(() => (window.gone = (window.gone ?? 0) + 1));
  const object = Rectangle({ objectName: "new" });
  Object.defineProperty(object, "$mounted", {
    value() {
      throw new Error("mounted badly");
    },
  });
  return object;
}
ReloadBadMount.$theme = { apply: () => setTheme({ file: "new.json", overrides: [] }) };
