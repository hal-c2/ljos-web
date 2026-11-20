import QtQuick

// An alias of the alias `TypedAliasHost.thing`.
Item {
    property alias thing: inner.thing

    TypedAliasHost {
        id: inner
    }
}
