// A geometry an application provides (features/quick3d/custom-geometry).
import QtQuick
import QtQuick3D

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias shape: shape
    View3D {
        id: view
        anchors.fill: parent
        environment: SceneEnvironment {
            backgroundMode: SceneEnvironment.Color
            clearColor: "#202020"
        }
        OrthographicCamera {
            id: camera
            z: 500
        }
        Model {
            source: ""
            geometry: Geometry {
                id: shape
                function square(half) {
                    setVertexData(new Float32Array([-half, -half, 0, half, -half, 0, half, half, 0, -half, -half, 0, half, half, 0, -half, half, 0]).buffer);
                    setStride(12);
                    addAttribute(Geometry.Attribute.PositionSemantic, 0, Geometry.Attribute.F32Type);
                    setBounds(Qt.vector3d(-half, -half, 0), Qt.vector3d(half, half, 0));
                    setPrimitiveType(Geometry.PrimitiveType.Triangles);
                    update();
                }
                Component.onCompleted: square(50)
            }
            materials: PrincipledMaterial {
                lighting: PrincipledMaterial.NoLighting
                baseColor: "#00ffff"
            }
        }
    }
}
