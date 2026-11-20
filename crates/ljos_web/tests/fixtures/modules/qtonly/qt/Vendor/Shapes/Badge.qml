import QtQuick
import Vendor.Shapes

// One of the module's own files, using a type its qmldir keeps elsewhere.
Item {
    // What a badge shows: made where it is shown, as a Component is.
    property Component face
    Glow { }
}
