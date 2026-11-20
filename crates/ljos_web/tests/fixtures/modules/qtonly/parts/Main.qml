import QtQuick

// Imports nothing of Vendor.Shapes: the part it is made of does, and the
// part's `face` is a Component that part's type declares.
Item {
    Panel {
        face: Rectangle { }
    }
}
