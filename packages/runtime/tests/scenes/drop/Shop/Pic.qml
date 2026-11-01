import QtQuick

// A block that shows a picture a shell names.
Item {
    objectName: "pic"
    width: 10
    height: 10
    property string picture
    property alias status: image.status
    Image {
        id: image
        source: parent.picture
    }
}
