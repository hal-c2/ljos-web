// A view named through its module's name, as `import QtQuick3D as Q3D` does.
import QtQuick
import QtQuick3D as Q3D

Rectangle {
    width: 200
    height: 150
    color: "#000000"

    Q3D.View3D {
        anchors.fill: parent
        environment: Q3D.SceneEnvironment {
            backgroundMode: Q3D.SceneEnvironment.Color
            clearColor: "#202020"
        }
        Q3D.OrthographicCamera { z: 500 }
        Q3D.Model {
            source: "#Rectangle"
            materials: Q3D.PrincipledMaterial {
                lighting: Q3D.PrincipledMaterial.NoLighting
                baseColor: "#ff0000"
            }
        }
    }
}
