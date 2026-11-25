// LottieAnimations told what to do, each in its own cell of a black window
// (see lottieplay.qml for the files).
import QtQuick
import Qt.labs.lottieqt

Rectangle {
    id: root
    width: 400
    height: 300
    color: "black"
    property alias paused: paused
    property alias toggled: toggled
    property alias stopped: stopped
    property alias held: held
    property alias past: past
    property alias played: played
    property alias marked: marked
    property var finishes: ({})
    property var found: []
    function finished(name) {
        const next = Object.assign({}, finishes)
        next[name] = (next[name] || 0) + 1
        finishes = next
    }
    function jump() {
        found = [marked.gotoAndStop("nowhere"), marked.gotoAndStop("middle")]
    }

    LottieAnimation { id: paused; source: "/assets/lottie/blink.json"; onFinished: root.finished("paused") }
    LottieAnimation {
        id: toggled; x: 100
        source: "/assets/lottie/blink.json"; onFinished: root.finished("toggled")
    }
    LottieAnimation {
        id: stopped; x: 200
        source: "/assets/lottie/slide.json"; onFinished: root.finished("stopped")
    }
    LottieAnimation { id: held; x: 300; source: "/assets/lottie/slide.json"; autoPlay: false }
    LottieAnimation { id: past; y: 100; source: "/assets/lottie/slide.json"; autoPlay: false }
    LottieAnimation {
        id: played; x: 100; y: 100
        source: "/assets/lottie/slide.json"; autoPlay: false; onFinished: root.finished("played")
    }
    LottieAnimation { id: marked; x: 200; y: 100; source: "/assets/lottie/slide.json"; autoPlay: false }
}
