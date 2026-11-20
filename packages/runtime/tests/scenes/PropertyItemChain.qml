import QtQuick

// A declared property's item reached through an alias of an alias of it.
Item {
    property alias deep: middle.exposed
    property alias middle: middle
    PropertyItemAlias {
        id: middle
    }
}
