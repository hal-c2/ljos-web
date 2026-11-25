// LottieAnimations that come to rest: one that ends, one paused, one waiting
// to be started and an endless one that cannot be seen. Ljós promises that
// an animation at rest asks for no time at all.
import QtQuick
import Qt.labs.lottieqt

Item {
    width: 400
    height: 300
    property alias ends: ends
    property alias pausing: pausing
    property alias waits: waits
    property alias unseen: unseen
    LottieAnimation { id: ends; source: "/assets/lottie/blink.json" }
    LottieAnimation { id: pausing; x: 100; source: "/assets/lottie/slide.json" }
    LottieAnimation { id: waits; x: 200; source: "/assets/lottie/slide.json"; autoPlay: false }
    LottieAnimation {
        id: unseen; x: 300
        source: "/assets/lottie/blink.json"; loops: LottieAnimation.Infinite; visible: false
    }
}
