// Two views on one page: one device on WebGPU, one for each canvas on WebGL2.
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias first: first
    property alias second: second

    Component {
        id: red
        View3D {
            OrthographicCamera { z: 500 }
            environment: SceneEnvironment {
                backgroundMode: SceneEnvironment.Color
                clearColor: "#202020"
            }
            Model {
                source: "#Rectangle"
                materials: PrincipledMaterial {
                    lighting: PrincipledMaterial.NoLighting
                    baseColor: "#0000ff"
                }
            }
        }
    }

    View3D {
        width: 200
        height: 300
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#202020"
        }
        OrthographicCamera { z: 500 }
        Model {
            id: first
            source: "#Rectangle"
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColor: "#ff0000"
            }
        }
    }
    Loader {
        id: second
        x: 200
        width: 200
        height: 300
        sourceComponent: red
    }
}
