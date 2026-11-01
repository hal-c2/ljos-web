import QtQuick

// What a shader named as `qsb` bakes it does when it is wrong or not all there.
Item {
    width: 400; height: 100

    function statuses() {
        return [wrong.status, malformed.status, unreadable.status, nogles.status]
    }
    function logs() {
        return [wrong.log, malformed.log, unreadable.log, nogles.log]
    }

    ShaderEffect { id: wrong; width: 100; height: 100; fragmentShader: "shaders/wrong.frag.qsb" }
    ShaderEffect { id: malformed; x: 100; width: 100; height: 100; fragmentShader: "shaders/malformed.frag.qsb" }
    ShaderEffect { id: unreadable; x: 200; width: 100; height: 100; fragmentShader: "shaders/unreadable.frag.qsb" }
    ShaderEffect { id: nogles; x: 300; width: 100; height: 100; fragmentShader: "shaders/nogles.frag.qsb" }
}
