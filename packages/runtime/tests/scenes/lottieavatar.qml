import QtQuick
import Qt.labs.lottieqt

// HAL-C2's avatars (ljos-ui features/lottie/avatars, MIT), drawn at 320
// by 320 as their previews are, one at a time.
Rectangle {
    width: 400; height: 300
    color: "white"
    property alias dance: dance
    property alias genie: genie
    LottieAnimation { id: dance; source: "/assets/lottie/hal-c2-dance.json"; autoPlay: false; scale: 0.625; transformOrigin: Item.TopLeft }
    LottieAnimation { id: genie; visible: false; source: "/assets/lottie/hal-c2-genie.json"; autoPlay: false; scale: 0.625; transformOrigin: Item.TopLeft }
}
