import QtQuick
import QtMultimedia

// A recording of an app built with Ljós, played over its poster
// (Site/ShowcaseApp.qml) in the reader's browser. Muted and looping,
// as a picture that moves: it plays only while `wanted` (the reader
// allows it, it is seen, its tab is shown) and keeps its place when
// paused, so it goes on from there.
Video {
    id: recording

    property bool wanted: false
    // Set once it has played, so it stands over its poster from then
    // on, paused or not; until then the poster shows.
    property bool begun: false

    muted: true
    loops: MediaPlayer.Infinite
    // The poster under it names what it shows; the video is the same
    // picture moving.
    Accessible.ignored: true

    onWantedChanged: wanted ? play() : pause()
    Component.onCompleted: {
        if (wanted)
            play();
    }
    onPlaying: begun = true
}
