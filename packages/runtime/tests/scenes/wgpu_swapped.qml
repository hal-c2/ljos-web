// Objects the view has not met yet, put in its place one after another: a
// material, an environment and a joint in a skin's empty slot.
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias view: view
    property alias cube: cube
    property alias skin: skin
    property PrincipledMaterial blue: PrincipledMaterial {
        lighting: PrincipledMaterial.NoLighting
        baseColor: "#0000ff"
    }
    property PrincipledMaterial green: PrincipledMaterial {
        lighting: PrincipledMaterial.NoLighting
        baseColor: "#00ff00"
    }
    property SceneEnvironment teal: SceneEnvironment {
        backgroundMode: SceneEnvironment.Color
        clearColor: "#008080"
    }
    property SceneEnvironment purple: SceneEnvironment {
        backgroundMode: SceneEnvironment.Color
        clearColor: "#800080"
    }
    property Node joint: Node {
        y: 100
    }
    View3D {
        id: view
        anchors.fill: parent
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#202020"
        }
        OrthographicCamera {
            z: 500
        }
        Model {
            id: cube
            source: "#Rectangle"
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColor: "#ff0000"
            }
        }
        Skin {
            id: skin
            joints: [first, null]
        }
        Model {
            x: 150
            source: "../assets/bar.mesh"
            skin: skin
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColor: "#ffffff"
                cullMode: Material.NoCulling
            }
        }
        Node {
            id: first
        }
    }
}
