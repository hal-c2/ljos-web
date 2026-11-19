import QtQuick

// A host whose `content` is the list of an item inside it: what an
// instance gives it is that item's.
Item {
    property alias inner: inner
    property alias content: inner.data

    Item {
        id: inner
        objectName: "inner"
        Rectangle { objectName: "own" }
    }
}
