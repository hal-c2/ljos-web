// What a LottieAnimation paints, as a painted item: the corner file is 40 by
// 20 with a red square 20 wide in its top left corner, the halves file red
// on its left half and green on its right. The window is black, but for the
// white cell at the bottom right.
import QtQuick
import Qt.labs.lottieqt

Rectangle {
    id: root
    width: 400
    height: 300
    color: "black"
    property alias unstretched: unstretched
    property alias fitted: fitted
    property alias doubled: doubled
    property alias filled: filled
    property alias wide: wide
    property alias textured: textured
    property alias nought: nought
    property alias translucent: translucent
    property var changes: []
    // Only what is assigned here: the bound texture size is a first change.
    function change() {
        changes = []
        textured.contentsScale = 2; textured.fillColor = "red"; textured.contentsSize = Qt.size(5, 5)
        textured.textureSize = Qt.size(5, 5); textured.renderTarget = LottieAnimation.FramebufferObject
    }

    // Given a size of its own once the file has set one.
    LottieAnimation {
        id: unstretched
        source: "/assets/lottie/corner.json"; autoPlay: false
        onStatusChanged: if (status === LottieAnimation.Ready) { width = 120; height = 80 }
    }
    Item {
        x: 140; width: 120; height: 80
        LottieAnimation {
            id: fitted
            anchors.fill: parent
            source: "/assets/lottie/halves.json"; autoPlay: false
            contentsScale: Math.min(width / 40, height / 20)
        }
    }
    LottieAnimation {
        id: doubled; x: 280
        source: "/assets/lottie/corner.json"; autoPlay: false; contentsScale: 2
    }
    LottieAnimation {
        id: filled; y: 100
        source: "/assets/lottie/corner.json"; autoPlay: false; fillColor: "#0000ff"
        onStatusChanged: if (status === LottieAnimation.Ready) { width = 80; height = 60 }
    }
    LottieAnimation {
        id: wide; x: 100; y: 100
        source: "/assets/lottie/corner.json"; autoPlay: false; fillColor: "#0000ff"
        contentsSize: Qt.size(50, 30); contentsScale: 2
    }
    LottieAnimation {
        id: textured; x: 220; y: 100
        source: "/assets/lottie/corner.json"; autoPlay: false; fillColor: "#0000ff"
        textureSize: Qt.size(80, 40)
        onContentsScaleChanged: root.changes = root.changes.concat(["scale"])
        onFillColorChanged: root.changes = root.changes.concat(["fill"])
        onContentsSizeChanged: root.changes = root.changes.concat(["contents"])
        onTextureSizeChanged: root.changes = root.changes.concat(["texture"])
        onRenderTargetChanged: root.changes = root.changes.concat(["target"])
    }
    LottieAnimation {
        id: nought; y: 200
        source: "/assets/lottie/corner.json"; autoPlay: false; fillColor: "#0000ff"; contentsScale: 0
    }
    Rectangle {
        x: 300; y: 200; width: 100; height: 100; color: "white"
        LottieAnimation {
            id: translucent
            source: "/assets/lottie/corner.json"; autoPlay: false; fillColor: "#800000ff"
        }
    }
}
