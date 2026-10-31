import QtQuick

// A block that hands an address a shell names to what fetches it.
Item {
    objectName: "sinks"
    property string address
    BorderImage { source: parent.address }
    AnimatedImage { source: parent.address }
    FontLoader { source: parent.address }
    Canvas { Component.onCompleted: loadImage(parent.address) }
    function ask() {
        const request = new XMLHttpRequest()
        request.open("GET", address)
        request.send()
        return request
    }
    function leave() {
        return Qt.openUrlExternally(address)
    }
}
