// A module of the package and a directory imported under one name are one
// namespace, the package's module imported last: a type of the package, and a
// singleton and a type of the directory, are all known by the name.
import QtQuick
import "shared/first" as P
import QtQuick.Controls as P

Item {
    width: 200
    height: 100
    property int hour: P.Clock.hour

    P.Button {
        id: button
        text: "pressed"
    }
    P.Shot {
        id: shot
    }

    function read() {
        return [hour, button.text, shot.objectName]
    }
}
