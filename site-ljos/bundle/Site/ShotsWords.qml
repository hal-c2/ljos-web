pragma Singleton
// Ljós's Core before QtQuick: only its t`` is wanted here.
import Ljos.Core
import QtQuick

// Every word /screenshots/ says (Site/ScreenshotsPage.qml), in one
// place, so a translation or a change of voice is one file.
QtObject {
    readonly property string title: t`Screenshots`
    readonly property string lede: t`Every deploy draws each demo and each shell again, on both kernels, in light and dark, and puts the pictures here beside the ones the deploy before drew. A picture that differs by more than the threshold is marked changed. If something looks wrong, report it from the picture.`
    readonly property string withoutScript: t`The pictures are listed in a file beside this page, which the page reads once its script runs:`
    readonly property string manifestLink: t`the list of pictures`
    readonly property string loading: t`Reading the list of pictures…`
    readonly property string none: t`No pictures here yet.`
    readonly property string noneWhy: t`Each deploy draws them after the site is built. This one drew none, so there is nothing to show.`

    readonly property string thisDeploy: t`This deploy`
    readonly property string comparedWith: t`Compared with`
    readonly property string firstDeploy: t`Nothing before: every picture is new.`
    function threshold(share) {
        return t`Changed means more than ${share} of a picture's pixels differ, anti-aliasing left out.`;
    }
    readonly property string totals: t`What this deploy drew`
    readonly property string pictures: t`pictures`
    readonly property string changed: t`changed`
    readonly property string broken: t`broken`
    function gone(count) {
        return t`${count} pictures the deploy before had are gone: what they were of is no longer listed.`;
    }

    readonly property string show: t`Show`
    readonly property string all: t`All`
    readonly property string onlyChanged: t`Changed`
    readonly property string onlyBroken: t`Broken`
    readonly property string nothingChanged: t`No picture changed.`
    readonly property string nothingBroken: t`No picture is broken.`

    // The renderers, as the page names them.
    readonly property var names: ({
            kernels: {
                solid: t`Solid kernel`,
                wasm: t`wasm kernel`
            },
            gpus: {
                webgpu: t`WebGPU`,
                webgl2: t`WebGL 2`
            }
        })
    readonly property var schemes: ({
            light: t`light`,
            dark: t`dark`
        })

    readonly property string same: t`Same as before`
    readonly property string fresh: t`New: nothing before to compare with`
    function changedBy(share) {
        return t`Changed: ${share} of pixels`;
    }
    function brokenBy(problems) {
        return t`Broken: ${problems}`;
    }
    function intended(reason) {
        return t`Intended: ${reason}`;
    }

    function before(sha) {
        return sha ? t`Before, ${sha}` : t`Before`;
    }
    readonly property string now: t`Now`
    readonly property string nothingBefore: t`No picture before`
    function pictureOf(when, label) {
        return t`${when}: ${label}`;
    }
    readonly property string difference: t`Difference`
    readonly property string fullSize: t`Full size`
    readonly property string report: t`Report a bug`
    readonly property string openImage: t`Open the image`
    readonly property string close: t`Close`
}
