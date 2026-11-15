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

    function read() {
        return [NetworkInformation.reachability, NetworkInformation.transportMedium, NetworkInformation.isMetered,
                NetworkInformation.isBehindCaptivePortal, root.online,
                NetworkInformation.Reachability.Disconnected, NetworkInformation.TransportMedium.WiFi]
    }
}
