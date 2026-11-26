// What `Ljos.Ui` keeps of Qt Quick for mirroring, frames and effects, and
// its `MotionPreference`, in a file of Ljós's API with no `QtQuick` import
// (ljosui.spec.js): LayoutMirroring, FrameAnimation, RectangularShadow,
// MultiEffect.
import Ljos.Ui
import Ljos.Core

Item {
    id: root
    width: 400
    height: 300

    property alias mirrored: mirrored
    property alias leading: leading
    property alias frames: frames
    property alias shadow: shadow
    property alias effect: effect
    property int ticks: 0
    property bool reduced: App.hints.accessibility.motionPreference === MotionPreference.Reduced
    property var motion: [MotionPreference.None, MotionPreference.Reduced]
    property bool mirroring: mirrored.LayoutMirroring.enabled

    Item {
        id: mirrored
        width: 200
        height: 50
        LayoutMirroring.enabled: true
        LayoutMirroring.childrenInherit: true

        Rectangle {
            id: leading
            anchors.left: parent.left
            width: 40
            height: 50
            fill: "tomato"
        }
    }

    FrameAnimation {
        id: frames
        running: true
        onTriggered: root.ticks++
    }

    Rectangle {
        id: card
        x: 20
        y: 80
        width: 60
        height: 40
        fill: "white"
    }
    RectangularShadow {
        id: shadow
        anchors.fill: card
        blur: 10
        color: "black"
    }

    Rectangle {
        id: icon
        x: 120
        y: 80
        width: 40
        height: 40
        fill: "white"
    }
    MultiEffect {
        id: effect
        source: icon
        anchors.fill: icon
        colorization: 1
        colorizationColor: "#2CDE85"
    }
}
