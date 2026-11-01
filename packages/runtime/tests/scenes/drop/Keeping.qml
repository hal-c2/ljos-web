import QtQuick
import Shop

// A site's shell over a block that keeps what it is handed: what the block
// finds kept, it loads as it is made.
Column {
    objectName: "keeping"
    Basket { id: basket; objectName: "basket" }
    Keeps { id: keeps; objectName: "keeps" }
}
