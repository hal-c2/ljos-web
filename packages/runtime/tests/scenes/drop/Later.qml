import QtQuick
import Cart

// The site's own use of Cart's block, of the name and id Shell.qml gives
// Shop's.
Item {
    width: 120
    height: 20
    Basket {
        id: basket
        objectName: "later"
    }
}
