// Two views that take each other's picture: each draws a square showing the
// other, so each draw is a new picture for the other to draw.
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"
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
            source: "#Rectangle"
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColorMap: Texture {
                    sourceItem: right
                }
            }
        }
    }
    View3D {
        id: right
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
    }
}
