import QtQuick

Item {
    property alias thing: inner.thing

    ObjectAliasHost {
        id: inner
    }
}
