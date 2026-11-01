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
    // What a program waiting on a request is told, as it is told it.
    function asked(done) {
        const request = new XMLHttpRequest()
        const told = []
        request.onreadystatechange = () => told.push(["readystatechange", request.readyState, request.status])
        for (const event of ["loadstart", "error", "loadend"])
            request.addEventListener(event, () => told.push([event, request.readyState, request.status]))
        request.addEventListener("loadend", () => done(told))
        request.open("GET", address)
        request.send()
    }
    function leave() {
        return Qt.openUrlExternally(address)
    }
}
