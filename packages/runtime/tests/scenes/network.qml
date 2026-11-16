import QtQuick
import QtNetwork

Item {
    id: root

    property bool online: NetworkInformation.reachability === NetworkInformation.Reachability.Online
    property var seen: []

    Connections {
        target: NetworkInformation
        function onReachabilityChanged() {
            root.seen.push(["reachability", NetworkInformation.reachability])
        }
    }

    // What assigning the browser's word says: Qt's refusal, or nothing.
    function assign() {
        try {
            NetworkInformation.reachability = NetworkInformation.Reachability.Online
            return ""
        } catch (error) {
            return String(error)
        }
    }

    function read() {
        return [NetworkInformation.reachability, NetworkInformation.transportMedium, NetworkInformation.isMetered,
                NetworkInformation.isBehindCaptivePortal, root.online,
                NetworkInformation.Reachability.Disconnected, NetworkInformation.TransportMedium.WiFi]
    }
}
