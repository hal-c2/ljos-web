import QtQuick
import "../Showcase/later.js" as Later

// A showcase recording (Showcase/Recording.qml), made by a Loader given
// what Ljos.Ui's cannot be given yet: the recording as a lazy import, so
// what plays a video is fetched only once one is to play. Ljos.Ui's
// Loader takes its `source` as a url only, and its item is untyped, so
// what ShowcaseApp sets on the recording and reads of it is here.
Loader {
    // The recording's address, and whether it plays.
    property string video: ""
    property bool wanted: false
    // Whether it has played, so it stands over its poster from then on.
    readonly property bool begun: item !== null && item.begun === true

    source: Later.recording
    onLoaded: {
        item.source = video;
        item.wanted = Qt.binding(() => wanted);
    }
}
