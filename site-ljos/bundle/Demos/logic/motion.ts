// Pure motion helpers: puck clamping, calm-aware spring and timing tuning,
// and Fisher-Yates move steps for ListModel.move.

export interface Point {
    readonly x: number
    readonly y: number
}

export interface SpringTuning {
    readonly spring: number
    readonly damping: number
}

export interface MoveStep {
    readonly from: number
    readonly to: number
}

// Keeps the puck's centre under the pointer without letting it escape the tray.
export function clampPuck(
    pointerX: number,
    pointerY: number,
    size: number,
    trayWidth: number,
    trayHeight: number,
): Point {
    const half = size / 2
    const maxX = Math.max(0, trayWidth - size)
    const maxY = Math.max(0, trayHeight - size)
    return {
        x: Math.max(0, Math.min(maxX, pointerX - half)),
        y: Math.max(0, Math.min(maxY, pointerY - half)),
    }
}

// Reduced motion removes overshoot (critical damping = 1.0) instead of snapping.
export function springTuning(
    calm: boolean,
    livelySpring: number,
    livelyDamping: number,
    calmSpring: number,
    calmDamping: number,
): SpringTuning {
    if (calm) {
        return { spring: calmSpring, damping: calmDamping }
    }
    return { spring: livelySpring, damping: livelyDamping }
}

export function duration(calm: boolean, normalMs: number, calmMs: number): number {
    return calm ? calmMs : normalMs
}

// Generates Fisher-Yates moves so the QML ListModel moves existing items in place,
// letting ListView's move transitions glide every tile to its new slot.
export function shuffleMoves(count: number): MoveStep[] {
    const steps: MoveStep[] = []
    for (let i = count - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        if (j !== i) {
            steps.push({ from: i, to: j })
        }
    }
    return steps
}
