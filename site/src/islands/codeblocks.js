// Every live code block on the page, hydrated as it nears the
// viewport. The page is built with Qt Quick Controls (ControlsHost),
// so it gives them to the compiler in the page: an example that
// imports them compiles and reloads here as it prerendered at build.
import "ljos-web/codeblock.css";
import "ljos-web/runtime.css";
import { hydrateLiveCodeBlocks } from "ljos-web/codeblock";
import { createCompiler } from "ljos-web/compiler";
import { modules } from "ljos-web/compiler/modules";
import "./ControlsHost.qml";

const { compile } = createCompiler({
  modules: {
    ...modules,
    "ljos-web/QtQuick/Controls": () => import("ljos-web/QtQuick/Controls"),
  },
});

hydrateLiveCodeBlocks(document, { compile });
