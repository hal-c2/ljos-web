import QtQuick
import QtQuick3D

// Written from Qt's documentation of the type: shows one of its children by
// how far its camera is from it, the nearest level first. Two levels share
// `fadeDistance` centred on the distance between them. Without a camera its
// children are left as they are declared.
Node {
    id: root

    property Camera camera: null
    property list<real> distances
    property real fadeDistance: 0

    readonly property real away: camera ? camera.scenePosition.minus(scenePosition).length() : -1

    function shares(count) {
        const given = Array.from(distances);
        const out = new Array(count).fill(0);
        const last = count - 1;
        let level = 0;
        while (level < given.length && away >= given[level])
            level++;
        out[Math.min(level, last)] = 1;
        if (fadeDistance <= 0)
            return out;
        const half = fadeDistance / 2;
        for (let i = 0; i < Math.min(given.length, last); i++) {
            if (Math.abs(away - given[i]) < half) {
                const farther = Math.max(0, Math.min(1, (away - (given[i] - half)) / fadeDistance));
                out.fill(0);
                out[i] = 1 - farther;
                out[i + 1] = farther;
                break;
            }
        }
        return out;
    }

    function place() {
        if (!camera)
            return;
        const levels = Array.from(children);
        const each = shares(levels.length);
        levels.forEach((level, index) => {
            level.visible = each[index] > 0;
            if (each[index] > 0)
                level.opacity = each[index];
        });
    }

    onAwayChanged: place()
    onDistancesChanged: place()
    onFadeDistanceChanged: place()
    Component.onCompleted: place()
}
