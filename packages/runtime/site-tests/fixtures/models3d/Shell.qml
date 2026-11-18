import QtQuick
import QtQuick3D
import QtQuick3D.AssetUtils

View3D {
    width: 200
    height: 200
    PerspectiveCamera { z: 300 }
    DirectionalLight {}
    RuntimeLoader { source: "parts/button.glb" }
    Model { source: "parts/tri.obj"; materials: PrincipledMaterial {} }
}
