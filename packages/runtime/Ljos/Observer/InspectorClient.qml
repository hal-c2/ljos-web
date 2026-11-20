import QtQml
import "inspecting.mjs" as Inspecting

// `InspectorClient`, the client `ljos observe` asks its inspector through
// (ljos-ui's `crates/ljos_cli/src/observe.rs`), with the same members: so
// the Observer's QML compiles and runs here as it is. `call` returns a
// serial at once and `answered` comes later, never inside the call. The
// token is not a file here but what an `Inspector` on the page serves its
// target under (its `tokenFile`), and the answers come from that target.
QtObject {
    id: client

    // Read again for every call, so that a target served again under a new
    // token is found.
    property string tokenFile
    // The name the client gives itself, as natively.
    property string clientName
    // The address the last call went to.
    readonly property string url: last.url
    // Whether the last call reached the inspector.
    readonly property bool connected: last.connected
    // Why the last call did not reach it; empty when it did.
    readonly property string error: last.error
    // Calls made and not answered yet.
    readonly property int pending: last.pending

    // What the members above are read from: only the runtime writes it.
    readonly property QtObject last: QtObject {
        property string url
        property bool connected: false
        property string error
        property int pending: 0
    }

    // The answer to call `serial`: `ok` when the tool answered without an
    // error, `result` the tool's result (JSON text) or why there is none.
    signal answered(int serial, string tool, bool ok, string result)

    // Calls `tool` with `args`, a JSON object as text.
    function call(tool, args) {
        return Inspecting.call(client, tool, args);
    }
    // The areas of the design rules the audit keeps findings of: none, the
    // audit is not answered on the web.
    function auditAreas() {
        return "";
    }
    // Where a rule's guide can be read in a browser.
    function guideUrl(guide) {
        return Inspecting.guideUrl(guide);
    }
}
