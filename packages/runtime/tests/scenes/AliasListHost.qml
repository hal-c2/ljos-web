import QtQuick

// A host whose `content` and `kept` are lists of an item inside it: what
// an instance gives them is that item's.
Item {
    property alias inner: inner
    property alias content: inner.data
    property alias kept: inner.resources

    Item {
        id: inner
        objectName: "inner"
        Rectangle { objectName: "own" }
    }
}
