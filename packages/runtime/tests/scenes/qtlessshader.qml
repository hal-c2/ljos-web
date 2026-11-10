import QtQuick

// Shaders named as Qt names what `qsb` bakes, on a machine with no `qsb`.
// flag.png is red on the left and blue on the right.
Item {
    id: root
    width: 300; height: 100

    function statuses() {
        return [forms.status, named.status, held.status]
    }
    function logs() {
        return [forms.log, named.log, held.log]
    }

    Image { id: flag; visible: false; source: "/assets/flag.png" }
    ShaderEffect {
        id: forms
        width: 100; height: 100
        property var source: flag
        property real along: 0.25
        property color wanted: "lime"
        vertexShader: "shaders/forms.vert.qsb"
        fragmentShader: "shaders/forms.frag.qsb"
    }
    ShaderEffect {
        id: named
        x: 100; width: 100; height: 100
        property color tint: "red"
        property real level: 2
        property point shift: Qt.point(0, 0)
        fragmentShader: "shaders/tint.frag.qsb"
    }
    ShaderEffect {
        id: held
        x: 200; width: 100; height: 100
        property color tint: "lime"
        property real level: 2
        property point shift: Qt.point(0, 0)
        fragmentShader: "shaders/baked/tint.frag.qsb"
    }
}
