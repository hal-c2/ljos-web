// What a LottieAnimation is before and as it loads: Qt 6.11's defaults and
// names (ljos-ui features/lottie/lottie-animation.feature and
// lottie-painted-item.feature), what the file sets once it is read, and how
// a file that is not there, or is not an animation, ends.
import QtQuick
import Qt.labs.lottieqt

Item {
    id: root
    width: 400
    height: 300
    property alias none: none
    property alias slide: slide
    property alias sized: sized
    property alias paced: paced
    property alias missing: missing
    property alias broken: broken
    property alias nothing: nothing
    property string defaults: "?"
    property string painted: "?"
    property string names: [LottieAnimation.Null, LottieAnimation.Loading,
        LottieAnimation.Ready, LottieAnimation.Error, LottieAnimation.Forward,
        LottieAnimation.Reverse, LottieAnimation.LowQuality,
        LottieAnimation.MediumQuality, LottieAnimation.HighQuality,
        LottieAnimation.Infinite].join(" ")
    property string targets: [LottieAnimation.Image, LottieAnimation.FramebufferObject,
        LottieAnimation.InvertedYFramebufferObject,
        LottieAnimation.FastFBOResizing].join(" ")
    property var slideStates: []
    property var missingStates: []

    LottieAnimation { id: none }
    LottieAnimation {
        id: slide
        source: "/assets/lottie/slide.json"
        autoPlay: false
        onStatusChanged: root.slideStates = root.slideStates.concat([status])
    }
    LottieAnimation { id: sized; source: "/assets/lottie/blink.json"; width: 10; autoPlay: false }
    LottieAnimation { id: paced; source: "/assets/lottie/slide.json"; frameRate: 5; autoPlay: false }
    LottieAnimation {
        id: missing
        source: "/assets/lottie/nowhere.json"
        onStatusChanged: root.missingStates = root.missingStates.concat([status])
    }
    LottieAnimation { id: broken; source: "/assets/lottie/broken.json" }
    LottieAnimation { id: nothing; source: "/assets/lottie/nothing.json" }

    // What assigning the first or the last frame says: Qt's refusal, or nothing.
    function assignFrames() {
        const said = []
        try { slide.startFrame = 3; said.push("") } catch (error) { said.push(String(error)) }
        try { slide.endFrame = 3; said.push("") } catch (error) { said.push(String(error)) }
        return said
    }

    Component.onCompleted: {
        defaults = [none.status, none.frameRate, none.loops, none.autoPlay, none.direction,
            none.quality, none.startFrame, none.endFrame, none.getDuration()].join(" ")
        painted = [none.contentsScale, none.fillColor, none.renderTarget,
            none.contentsSize.width, none.contentsSize.height,
            none.textureSize.width, none.textureSize.height].join(" ")
    }
}
