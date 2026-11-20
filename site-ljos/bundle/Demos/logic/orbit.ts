// Pure motion maths for the 3D lighthouse scene. State and the frame clock stay
// in Orbit.qml so pausing the demo stops every tick at 0 % CPU.

export const FULL_TURN = 360

export interface OrbitPose {
    readonly sweep: number
    readonly ring: number
    readonly sphere: number
    readonly cubeX: number
    readonly cubeY: number
    readonly cone: number
}

// Degrees per second: calm slows the scene to a third instead of stopping it.
export function degreesPerSecond(calm: boolean, normalSeconds: number, calmSeconds: number): number {
    const seconds = calm ? calmSeconds : normalSeconds
    return FULL_TURN / seconds
}

// Steps the shared clock inside [startAngle, startAngle + 360) so pausing or
// changing pace continues from the current angle with no snap.
export function advance(turn: number, dt: number, pace: number, startAngle: number): number {
    const offset = (turn - startAngle + dt * pace) % FULL_TURN
    return startAngle + (offset < 0 ? offset + FULL_TURN : offset)
}

// Each part turns at a whole multiple of `turn`, so a full 360-degree loop
// wraps cleanly without a seam.
export function poseAt(turn: number): OrbitPose {
    return {
        sweep: turn * 2,
        ring: turn,
        sphere: turn * 4,
        cubeX: turn * 2,
        cubeY: turn * 3,
        cone: turn * -3,
    }
}
