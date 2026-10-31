import QtQuick
import QtQuick.Templates as T
import "inspected"

Rectangle {
    id: root
    objectName: "main"
    width: 400; height: 300
    color: "white"
    property int count: 0
    property int doubled: count * 2
    property int presses: 0

    Timer { id: timer; interval: 1000 }
    Text {
        id: label
        objectName: "label"
        text: "n=" + root.count
        Rectangle { id: dot; width: 4; height: 4 }
    }
    Card { id: card; x: 300; y: 0 }
    MouseArea {
        id: area
        objectName: "area"
        x: 0; y: 50; width: 100; height: 50
        onClicked: root.count++
    }
    Rectangle {
        id: tapped
        x: 100; y: 50; width: 50; height: 50
        property int taps: 0
        TapHandler { onTapped: tapped.taps++ }
    }
    T.Button {
        id: button
        x: 0; y: 120; width: 80; height: 40
        text: "go"
        onClicked: root.presses++
    }
    MouseArea {
        id: under
        x: 150; y: 120; width: 100; height: 50
        property int hits: 0
        onClicked: hits++
    }
    MouseArea {
        id: over
        x: 200; y: 120; width: 100; height: 50
        property int hits: 0
        onClicked: hits++
    }
    Repeater {
        id: rows
        model: 2
        Rectangle { objectName: "row" + index; x: index * 20; y: 200; width: 10; height: 10 }
    }
    Loader {
        id: loader
        y: 250
        sourceComponent: Text { objectName: "loaded"; text: "loaded" }
    }
    Component.onCompleted: console.log("ready", count)
    function shout() { console.warn("loud", root.count) }
}
