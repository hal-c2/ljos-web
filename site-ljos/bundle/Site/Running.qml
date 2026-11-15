pragma Singleton
import QtQuick

// What runs on the page. The rule of thumb (site-ljos/README.md):
// nothing runs until the reader asks. A plain example runs when its
// picture is pressed or its code edited; one that is a window, draws
// in 3D, or keeps moving on its own (a timer, an animation that
// loops), and every demo but the Pantry, waits for the reader to
// press Run. At most `most` are started at once: one
// more stops another, out of view first. One that leaves the view, or
// a page whose tab is hidden, pauses, and resumes when it is back.
QtObject {
    id: running

    // The page's view, in the shell's coordinates: the band of it the
    // reader sees, under the header.
    property real viewTop: 0
    property real viewBottom: 0
    // Told whenever the view moves or the page under it changes size,
    // so each runner looks again where it stands; nothing asks on a
    // timer.
    signal moved()

    // A hidden tab runs nothing: the reader is not looking.
    readonly property bool shown: Qt.application.state !== Qt.ApplicationHidden && Qt.application.state !== Qt.ApplicationSuspended

    readonly property int most: 3
    // The runners started, the one that started first first; a paused
    // one keeps its place.
    property var held: []

    // `runner` starts: one over the budget stops another, the one that
    // started first among those out of view, else the one that started
    // first.
    function claim(runner) {
        var now = held.filter(function (other) {
            return other !== runner;
        });
        while (now.length >= most) {
            var away = now.findIndex(function (other) {
                return !other.onScreen;
            });
            var oldest = now.splice(away >= 0 ? away : 0, 1)[0];
            oldest.evict();
        }
        now.push(runner);
        held = now;
    }

    function release(runner) {
        held = held.filter(function (other) {
            return other !== runner;
        });
    }
}
