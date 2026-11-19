// A View3D beside what is not in it: the page around a renderer that
// stopped still answers. A second view is made when the test asks
// (`later`), so the test can hold what that view's renderer is given.
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias moved: moved
    property alias counter: counter
    property alias later: later
    QtObject {
        id: counter
        property int count: 0
    }
    View3D {
        anchors.fill: parent
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#202020"
        }
        OrthographicCamera { z: 500 }
        Model {
            id: moved
            source: "#Rectangle"
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColor: "#ff0000"
            }
        }
    }
    Loader {
        id: later
        active: false
        width: 100
        height: 100
        sourceComponent: View3D {
            OrthographicCamera { z: 500 }
            Model {
                source: "#Rectangle"
                materials: PrincipledMaterial {
                    lighting: PrincipledMaterial.NoLighting
                    baseColor: "#00ff00"
                }
            }
        }
    }
    Text {
        objectName: "said"
        color: "#ffffff"
        text: "count " + counter.count
    }
}
