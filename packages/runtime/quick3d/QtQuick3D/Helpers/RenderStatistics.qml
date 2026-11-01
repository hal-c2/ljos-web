import QtQuick

// What ljos-ui's DebugView reads, which its engine has natively for the whole
// process. Here each view has its own record, so this asks the view of the
// panel it is in. A browser does not say what the GPU took, which the -1 of
// those two says.
Item {
    readonly property var view: parent ? parent.source : null

    property real fps: 0
    property real frameTime: 0
    property real gpuTime: -1
    property real gpuPostTime: -1
    property int drawCalls: 0
    property int shadowPasses: 0
    property int frames: 0

    function refresh() {
        const stats = view ? view.renderStats : null
        if (!stats)
            return
        fps = stats.fps
        frameTime = stats.frameTime
        drawCalls = stats.drawCallCount
        frames += stats.fps
    }
}
