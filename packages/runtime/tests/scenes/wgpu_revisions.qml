// What an application commits over and over: a shape, a picture and a table,
// each drawn so that each revision reaches the GPU.
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias shape: shape
    property alias picture: picture
    property alias table: table
    Component {
        id: copy
        InstanceListEntry { scale: Qt.vector3d(0.01, 0.01, 1) }
    }
    Component.onCompleted: {
        const all = [];
        for (let i = 0; i < 2000; i++)
            all.push(copy.createObject(table));
        table.instances = all;
    }
    View3D {
        anchors.fill: parent
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#202020"
        }
        OrthographicCamera { z: 500 }
        Model {
            source: ""
            x: -120
            geometry: Geometry { id: shape }
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColor: "#00ffff"
            }
        }
        Model {
            source: "#Rectangle"
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColorMap: Texture { textureData: TextureData { id: picture } }
            }
        }
        Model {
            source: "#Rectangle"
            x: 120
            scale: Qt.vector3d(0.2, 0.2, 1)
            instancing: InstanceList { id: table }
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColor: "#ffff00"
            }
        }
    }
}
