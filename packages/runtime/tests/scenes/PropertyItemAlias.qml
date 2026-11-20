import QtQuick

// A declared property's item reached through an alias of it.
Item {
    property alias exposed: inner.made
    property alias inner: inner
    Item {
        id: inner
        objectName: "inner"
        property Item made
    }
}
