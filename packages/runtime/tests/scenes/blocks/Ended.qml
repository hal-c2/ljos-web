import QtQuick
Rectangle { objectName: "ended-shell"; width: 5; height: 5; Component.onDestruction: console.log("ended") }
