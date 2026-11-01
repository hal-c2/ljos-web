// Mapping between the view, the scene and a node (features/quick3d/mapping).
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias view: view
    property alias outer: outer
    property alias inner: inner
    View3D {
        id: view
        anchors.fill: parent
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#202020"
        }
        OrthographicCamera {
            id: camera
            z: 500
        }
        Node {
            id: outer
            x: 100
            y: 50
            scale: Qt.vector3d(2, 2, 2)
            Node {
                id: inner
                x: 10
            }
        }
    }
}
