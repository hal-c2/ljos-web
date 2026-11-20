// What `Inspector.qml` and `InspectorClient.qml` call: a module of plain
// JavaScript, which QML imports as it is (a `.ts` or `.js` one would be
// compiled as QML's script), and which is the same module the runtime's
// `ljos-web/Ljos/Observer` is, so a token one serves the other finds.
export { call, follow, guideUrl, release } from "./index.ts";
