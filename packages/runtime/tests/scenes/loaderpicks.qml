// What a pick reads of the files RuntimeLoaders name: one whose buffer is
// a file beside it, one whose buffer is in its description.
import QtQuick
import QtQuick3D
import QtQuick3D.AssetUtils
Rectangle {
    width: 400
    height: 300
    property alias pair: pair
    property alias square: square
    View3D {
        anchors.fill: parent
        OrthographicCamera { z: 500 }
        RuntimeLoader { id: pair; source: "wgpu_models/pair.gltf" }
        RuntimeLoader { id: square; source: "wgpu_models/square.gltf" }
    }
}
