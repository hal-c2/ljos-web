// One view that shows another's picture, one way: the right view's large
// square is textured with the left view, and the right view has a small
// square of its own. Each view has something that can move.
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias moved: moved
    property alias own: own
    View3D {
        id: left
        x: 0
        width: 200
        height: 300
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#400000"
        }
        OrthographicCamera {
            z: 500
        }
        Model {
            id: moved
            source: "#Rectangle"
            scale: Qt.vector3d(0.5, 0.5, 1)
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColor: "#ff0000"
            }
        }
    }
    View3D {
        x: 200
        width: 200
        height: 300
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#000040"
        }
        OrthographicCamera {
            z: 500
        }
        Model {
            source: "#Rectangle"
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColorMap: Texture {
                    sourceItem: left
                }
            }
        }
        Model {
            id: own
            source: "#Rectangle"
            y: -120
            scale: Qt.vector3d(0.2, 0.2, 1)
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColor: "#00ff00"
            }
        }
    }
}
