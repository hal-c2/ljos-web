// LottieAnimations playing on a black window, each in a cell of its own a
// hundred wide and high: the slide is 100 by 100, a white bar 12 wide going
// from x 10 to 90 in two seconds at ten frames a second; the blink is a
// white 40 by 30 half a second long at twenty.
import QtQuick
import Qt.labs.lottieqt

Rectangle {
    id: root
    width: 400
    height: 300
    color: "black"
    property alias once: once
    property alias waiting: waiting
    property alias fast: fast
    property alias twice: twice
    property alias endless: endless
    property alias reverse: reverse
    property alias hidden: hidden
    property alias faded: faded
    property var finishes: ({})
    function finished(name) {
        const next = Object.assign({}, finishes)
        next[name] = (next[name] || 0) + 1
        finishes = next
    }

    LottieAnimation { id: once; source: "/assets/lottie/slide.json"; onFinished: root.finished("once") }
    LottieAnimation {
        id: waiting; x: 100
        source: "/assets/lottie/slide.json"; autoPlay: false; onFinished: root.finished("waiting")
    }
    LottieAnimation {
        id: fast; x: 200
        source: "/assets/lottie/slide.json"; onFinished: root.finished("fast")
        onStatusChanged: if (status === LottieAnimation.Ready) frameRate = 40
    }
    LottieAnimation {
        id: twice; x: 300
        source: "/assets/lottie/blink.json"; loops: 2; onFinished: root.finished("twice")
    }
    LottieAnimation {
        id: endless; y: 100
        source: "/assets/lottie/blink.json"; loops: LottieAnimation.Infinite
        onFinished: root.finished("endless")
    }
    LottieAnimation {
        id: reverse; x: 100; y: 100
        source: "/assets/lottie/slide.json"; autoPlay: false; direction: LottieAnimation.Reverse
    }
    LottieAnimation {
        id: hidden; x: 200; y: 100
        source: "/assets/lottie/blink.json"; visible: false; onFinished: root.finished("hidden")
    }
    Item {
        opacity: 0
        LottieAnimation {
            id: faded; x: 300; y: 100
            source: "/assets/lottie/blink.json"; onFinished: root.finished("faded")
        }
    }
}
