import QtQuick

// A shader a reader edits as the page runs: each edit is a new source in
// a data: URL, as an editor beside an effect gives it, and the effect
// before it (`kept`) still draws with the source it was given first.
Item {
    id: root
    width: 64
    height: 32

    ShaderEffect {
        id: edited
        width: 32
        height: 32
        property real shade: 0
    }
    ShaderEffect {
        id: kept
        x: 32
        width: 32
        height: 32
        property real shade: 0
    }

    function source(shade) {
        return "#version 300 es\nprecision highp float;\nuniform float shade;\nout vec4 fragColor;\nvoid main() { fragColor = vec4(shade, " + shade.toFixed(3) + ", 0.0, 1.0); }\n"
    }
    function address(text) {
        return "data:text/plain," + encodeURIComponent(text)
    }
    function edit(shade) { edited.fragmentShader = address(source(shade)) }
    function editTo(text) { edited.fragmentShader = address(text) }
    function keep(shade) { kept.fragmentShader = address(source(shade)) }
    function status() { return edited.status }
    function log() { return edited.log }
}
