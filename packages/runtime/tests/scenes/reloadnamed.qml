// The rectangle's id is `crate`, `box` in reloadname.
import QtQuick

Item {
    width: 400
    height: 300
    property alias thing: crate

    Rectangle { id: crate; width: 10; height: 10 }
}
