import QtQuick
import QtQml.XmlListModel
import QtWebSockets
import Shop

// A site's shell that reaches another site as it is made, as a site may.
Column {
    objectName: "reaches"
    property string answer: ""
    readonly property int loaded: model.status
    readonly property int socketStatus: socket.status
    Basket { id: basket; objectName: "basket" }
    WebSocket {
        id: socket
        url: "wss://evil.example/socket"
        active: true
    }
    XmlListModel {
        id: model
        source: "https://evil.example/list.xml"
        query: "/items/item"
    }
    Component.onCompleted: {
        console.log("reaches made")
        const request = new XMLHttpRequest()
        request.onreadystatechange = () => {
            if (request.readyState === XMLHttpRequest.DONE) answer = "done " + request.status
        }
        request.open("GET", "https://evil.example/asked")
        request.send()
    }
}
