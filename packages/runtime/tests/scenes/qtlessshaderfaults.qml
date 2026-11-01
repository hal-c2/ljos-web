import QtQuick

// What a shader named as `qsb` bakes it does when it is wrong or not all there.
Item {
    width: 400; height: 200

    function statuses() {
        return [wrong.status, malformed.status, unreadable.status, nogles.status, onlyUnreadable.status, onlyNogles.status, oneSide.status]
    }
    function logs() {
        return [wrong.log, malformed.log, unreadable.log, nogles.log, onlyUnreadable.log, onlyNogles.log, oneSide.log]
    }

    ShaderEffect { id: wrong; width: 100; height: 100; fragmentShader: "shaders/wrong.frag.qsb" }
    ShaderEffect { id: malformed; x: 100; width: 100; height: 100; fragmentShader: "shaders/malformed.frag.qsb" }
    ShaderEffect { id: unreadable; x: 200; width: 100; height: 100; fragmentShader: "shaders/unreadable.frag.qsb" }
    ShaderEffect { id: nogles; x: 300; width: 100; height: 100; fragmentShader: "shaders/nogles.frag.qsb" }
    // Most of Qt's examples ship what is baked and not what it was baked from.
    ShaderEffect { id: onlyUnreadable; y: 100; width: 100; height: 100; fragmentShader: "shaders/onlyunreadable.frag.qsb" }
    ShaderEffect { id: onlyNogles; x: 100; y: 100; width: 100; height: 100; fragmentShader: "shaders/onlynogles.frag.qsb" }
    ShaderEffect { id: oneSide; x: 200; y: 100; width: 100; height: 100; vertexShader: "shaders/oneside.vert.qsb"; fragmentShader: "shaders/oneside.frag.qsb" }
}
