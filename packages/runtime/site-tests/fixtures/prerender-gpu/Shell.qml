import QtQuick
import QtQuick3D

// A page with the faces that paint: a 3D view and a shader. Neither
// has a GPU where a prerender runs, and A26 has them stand in the
// HTML as the elements they paint into, painting when the page
// hydrates — the build must not fall over making them.
Column {
    Text { text: "GPU faces prerendered"; font.pixelSize: 24; font.bold: true }
    View3D {
        width: 200
        height: 120
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#20242e"
        }
        PerspectiveCamera { z: 400 }
        DirectionalLight {}
        Model {
            source: "#Cube"
            materials: PrincipledMaterial { baseColor: "#e8a33d" }
        }
    }
    ShaderEffect {
        width: 200
        height: 60
        property color tint: "#e8a33d"
        fragmentShader: "paint.frag.qsb"
    }
    Text { text: "Words beside what paints." }
}
