// A Targa file as a picture on a sheet, as Qt reads it: by the rows the file
// says it begins with, and by runs. The files are two pixels by two: red and
// green over blue and grey; the last has a run of one dark grey for its top.
import QtQuick
import QtQuick3D

Rectangle {
    id: root
    width: 400
    height: 300
    color: "#202020"

    function read() {
        return {};
    }

    View3D {
        anchors.fill: parent
        camera: camera
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "black"
        }

        PerspectiveCamera {
            id: camera
            z: 259.8
            clipNear: 1
        }

        component Sheet: Model {
            property alias file: picture.source
            source: "#Rectangle"
            materials: DefaultMaterial {
                lighting: DefaultMaterial.NoLighting
                diffuseMap: Texture {
                    id: picture
                    magFilter: Texture.Nearest
                }
            }
        }

        Sheet { x: -120; file: "../assets/bottom-up.tga" }
        Sheet { x: 0; file: "../assets/top-down.tga" }
        Sheet { x: 120; file: "../assets/runs.tga" }
    }
}
