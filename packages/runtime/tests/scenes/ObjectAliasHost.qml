import QtQuick

Item {
    property alias thing: keeper.thing

    QtObject {
        id: keeper
        property QtObject thing
    }
}
