// Views in space with nothing to draw on: one no wider than nothing, one no
// taller, beside one that draws. A scene of these is ready once the last has
// drawn, for the first two have no picture to wait for.
import QtQuick
import QtQuick3D

Rectangle {
    width: 300
    height: 100
    color: "white"

    component Seen: View3D {
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#204060"
        }
        OrthographicCamera { z: 500 }
        Model {
            source: "#Cube"
            materials: PrincipledMaterial { lighting: PrincipledMaterial.NoLighting; baseColor: "red" }
        }
    }

    Seen { width: 0; height: 100 }
    Seen { x: 100; width: 100; height: 0 }
    Seen { x: 200; width: 100; height: 100 }
}
