import QtQuick
import Ljos.Observer

// An `Inspector` serving `target`, and an `InspectorClient` that asks it:
// for what drives an app of its own page through the inspector, as an
// agent would (a recorded agent's replay), and draws nothing.
// Not in the qmldir, as `ObserverPanel.qml` is not: it is fetched by its
// path (`ljos-web/observer/InspectorSession.qml`), so a project that holds
// one names no type only the web has.
Item {
    id: session

    property var target: null
    property var logs: null
    property string title: ""
    property string clientName: ""
    // The token what is served answers to; empty while nothing is.
    readonly property alias tokenFile: client.tokenFile

    signal answered(int serial, string tool, bool ok, string result)

    function call(tool, args) {
        return client.call(tool, args);
    }

    Inspector {
        id: inspector
        target: session.target
        logs: session.logs
        title: session.title
    }

    InspectorClient {
        id: client
        tokenFile: inspector.tokenFile
        clientName: session.clientName
        onAnswered: (serial, tool, ok, result) => session.answered(serial, tool, ok, result)
    }
}
