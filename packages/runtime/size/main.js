// What a QtQuick page pulls in, whatever of it the page uses: the kernel,
// every QtQuick type and the mount. Its bundle is the budget's measure.
import * as quick from "ljos-web/QtQuick";
import * as runtime from "ljos-web/runtime";

globalThis.kept = [quick, runtime];
