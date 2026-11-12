---
title: Live blocks fixture
description: Every kind of code block, for the live code block tests.
section: start
order: 2
---

A whole app:

```qml
import QtQuick

Rectangle {
    id: root
    width: 320
    height: 180
    color: "#20242e"
    property int count: 0

    Text {
        anchors.centerIn: parent
        color: "#e8eaf0"
        font.pixelSize: 24
        text: "Count: " + root.count
    }
    MouseArea {
        anchors.fill: parent
        onClicked: root.count = root.count + 1
    }
}
```

A snippet in a harness:

```qml harness=window
Text {
    anchors.centerIn: parent
    color: "#e8eaf0"
    text: "Hello from a snippet"
}
```

The user's own shell over an app's contribution:

```qml file=Main.qml group=shell
import QtQuick
import Ljos.Blocks

Rectangle {
    width: 280
    height: 160
    color: "#20242e"
    QtObject {
        id: counter
        property int count: 0
    }
    Contribution {
        slot: "main"
        Text {
            objectName: "counter-view"
            color: "#e8eaf0"
            text: "Count: " + counter.count
        }
    }
    ShellLoader {
        anchors.fill: parent
        source: "user/Shell.qml"
        fallback: "Default.qml"
    }
    MouseArea {
        anchors.fill: parent
        onClicked: counter.count = counter.count + 1
    }
}
```
```qml file=user/Shell.qml group=shell
import QtQuick
import Ljos.Blocks

Column {
    spacing: 6
    Text {
        color: "#9ec1ff"
        text: "My shell"
    }
    Slot {
        name: "main"
    }
}
```
```qml file=Default.qml group=shell
import QtQuick
import Ljos.Blocks

Column {
    spacing: 6
    Text {
        color: "#e8eaf0"
        text: "App shell"
    }
    Slot {
        name: "main"
    }
}
```

A control from Qt Quick Controls, which this page is built with:

```qml
import QtQuick
import QtQuick.Controls

Rectangle {
    id: root
    width: 260
    height: 120
    color: "#20242e"
    property int count: 0

    Column {
        anchors.centerIn: parent
        spacing: 8
        Text {
            anchors.horizontalCenter: parent.horizontalCenter
            color: "#e8eaf0"
            text: "Pressed: " + root.count
        }
        Button {
            anchors.horizontalCenter: parent.horizontalCenter
            text: "Press"
            onClicked: root.count += 1
        }
    }
}
```

The old half of a before/after, and a shell command:

```qml before
import QtQuick

Rectangle { width: 80; height: 40; color: "red" }
```

```sh
ljos check Main.qml
```

A block inside a list item, carrying its container's indent:

1. First, this:

   ```qml
   import QtQuick

   Rectangle {
       width: 160
       height: 60
       color: "#20242e"
       Text {
           anchors.centerIn: parent
           color: "#e8eaf0"
           text: "From a list"
       }
   }
   ```
