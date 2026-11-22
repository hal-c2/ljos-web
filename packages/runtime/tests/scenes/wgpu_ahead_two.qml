// Two views of one model file, the second with a file of its own besides,
// which can keep it from turning to wgpu after the first has.
import QtQuick
import QtQuick3D
import QtQuick3D.AssetUtils

Rectangle {
    width: 400
    height: 300
    color: "#000000"
    property alias first: first
    property alias second: second
    property alias apart: apart

    View3D {
        width: 200
        height: 300
        OrthographicCamera {
            z: 500
        }
        RuntimeLoader {
            id: first
        }
    }
    View3D {
        x: 200
        width: 200
        height: 300
        OrthographicCamera {
            z: 500
        }
        RuntimeLoader {
            id: second
        }
        RuntimeLoader {
            id: apart
        }
    }
}
