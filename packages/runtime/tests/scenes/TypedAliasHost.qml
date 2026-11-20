import QtQuick

// An alias of a property that holds only a number.
Item {
    property alias thing: keeper.thing

    QtObject {
        id: keeper
        property int thing: 7
    }
}
