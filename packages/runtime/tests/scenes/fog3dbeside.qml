// fog3d's scene with a model from a file beside it, where the picture is
// not read: what the JavaScript renderer draws as Qt does, and what only
// wgpu reads, in one view. The functions take the fog away and give it back.
import QtQuick
import QtQuick3D
import QtQuick3D.AssetUtils

Rectangle {
    id: root
    width: 300
    height: 200
    color: "#202020"

    function cleared() {
        fog.enabled = false;
    }
    function fogged() {
        fog.enabled = true;
    }

    View3D {
        id: view
        anchors.fill: parent
        camera: camera
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#203040"
            fog: Fog {
                id: fog
                enabled: true
                color: "#c0a060"
                depthEnabled: true
                depthNear: 400
                depthFar: 1200
                leastIntenseY: 120
                mostIntenseY: -120
            }
        }

        PerspectiveCamera {
            id: camera
            z: 600
            fieldOfView: 35
        }
        DirectionalLight {
            brightness: 1.5
        }

        Model {
            x: -160
            z: 100
            source: "#Cube"
            scale: Qt.vector3d(1.2, 1.2, 0.1)
            materials: DefaultMaterial {
                diffuseColor: "#4080c0"
            }
        }
        Model {
            x: -120
            y: 80
            z: -200
            source: "#Cube"
            scale: Qt.vector3d(1.6, 1.6, 0.1)
            materials: PrincipledMaterial {
                baseColor: "#4080c0"
                roughness: 0.3
            }
        }
        Model {
            x: 20
            y: 200
            z: -500
            source: "#Cube"
            scale: Qt.vector3d(2.4, 2.4, 0.1)
            materials: DefaultMaterial {
                diffuseColor: "#4080c0"
            }
        }
        Model {
            x: 40
            y: -20
            source: "#Cube"
            scale: Qt.vector3d(0.8, 3.2, 0.1)
            materials: DefaultMaterial {
                diffuseColor: "#909090"
            }
        }
        Model {
            x: 180
            y: 60
            z: -300
            source: "#Rectangle"
            scale: Qt.vector3d(1.5, 1.5, 1)
            materials: DefaultMaterial {
                lighting: DefaultMaterial.NoLighting
                diffuseColor: "#40c060"
            }
        }
        Model {
            x: 180
            y: -90
            z: -300
            source: "#Rectangle"
            scale: Qt.vector3d(1.5, 1.5, 1)
            materials: PrincipledMaterial {
                baseColor: "#202020"
                emissiveFactor: Qt.vector3d(0.6, 0.1, 0.1)
            }
        }
        // Out of the picture: no point that is read has any of it.
        RuntimeLoader {
            x: 5000
            source: "wgpu_models/square.gltf"
        }
    }
}
