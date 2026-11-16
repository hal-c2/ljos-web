// A scene made for a headset, on a page that has none: seen from where the
// head of someone standing at the origin would be.
import QtQuick
import QtQuick3D
import QtQuick3D.Xr

XrView {
    id: view

    referenceSpace: XrView.ReferenceSpaceStage

    property int failures: 0
    onInitializeFailed: failures += 1

    environment: SceneEnvironment {
        backgroundMode: SceneEnvironment.Color
        clearColor: "#204060"
    }

    xrOrigin: XrOrigin {
        id: origin

        camera: XrCamera { id: head }
        // What the origin's camera is for a while, and then is not.
        property XrCamera spare: XrCamera { }

        XrController {
            id: left
            controller: XrController.ControllerLeft

            XrInputAction {
                id: trigger
                hand: XrInputAction.LeftHand
                actionId: [XrInputAction.TriggerPressed, XrInputAction.TriggerValue]
            }
        }
    }

    DirectionalLight { }

    // Straight ahead of the eyes, two metres away.
    Model {
        id: ahead
        source: "#Cube"
        y: 160
        z: -200
        scale: Qt.vector3d(0.5, 0.5, 0.5)
        materials: DefaultMaterial {
            lighting: DefaultMaterial.NoLighting
            diffuseColor: "#ff0000"
        }
    }

    function read() {
        const at = (v) => [v.x, v.y, v.z].map((n) => Math.round(n * 1000) / 1000)
        return {
            head: at(head.scenePosition),
            parent: head.parent === origin,
            failures,
            enums: [XrView.ReferenceSpaceLocalFloor, XrController.AimPose, XrController.RightHand, XrInputAction.CustomAction,
                    XrInputAction.TriggerPressed, XrInputAction.HandTrackingMenuPress, XrInputAction.NumActions],
            hand: [left.controller, left.poseSpace, left.isActive],
            action: [trigger.value, trigger.pressed, trigger.enabled, trigger.actionId],
            origin: at(origin.scenePosition),
            children: [origin.parent === view, ahead.parent === view],
            hit: view.rayPick(head.scenePosition, head.forward).objectHit,
            held: [head.parent === origin, origin.children.indexOf(head) >= 0,
                   origin.spare.parent === origin, origin.children.indexOf(origin.spare) >= 0],
        }
    }

    function step(index) {
        if (index === 0) origin.position = Qt.vector3d(100, 0, 50)
        else if (index === 1) {
            origin.position = Qt.vector3d(0, 0, 0)
            referenceSpace = XrView.ReferenceSpaceLocal
        } else if (index === 2) ahead.y = 0
        else if (index === 3) origin.camera = origin.spare
        else if (index === 4) origin.camera = head
    }
}
