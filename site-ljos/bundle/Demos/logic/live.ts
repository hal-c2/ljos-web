// What a pro demo (CockpitDemo.qml, WatchDemo.qml) reads of the app it
// loads: the live module the reader's edits make (Demos/pro-live.js), and
// the objects the app names, which the frame drives from outside.

// Whether the page gave a live app: it gives nothing, or null, for the one
// the page was built with.
export function isLive(live: unknown): boolean {
    return live !== undefined && live !== null
}

function isListLike(value: unknown): value is ArrayLike<unknown> {
    return typeof value === "object" && value !== null && "length" in value && typeof value.length === "number"
}

function hasName(value: unknown, name: string): boolean {
    return typeof value === "object" && value !== null && "objectName" in value && value.objectName === name
}

function first(list: unknown, name: string): unknown {
    if (!isListLike(list)) return undefined
    for (let i = 0; i < list.length; i++) {
        const object = list[i]
        if (hasName(object, name)) return object
    }
    return undefined
}

// The object the app holds but does not draw (its `resources`) by the name
// it gives it, or nothing.
export function resource(item: unknown, name: string): unknown {
    return typeof item === "object" && item !== null && "resources" in item ? first(item.resources, name) : undefined
}

// The item the app holds (its `children`) by the name it gives it, or
// nothing.
export function child(item: unknown, name: string): unknown {
    return typeof item === "object" && item !== null && "children" in item ? first(item.children, name) : undefined
}

interface Focusable {
    forceActiveFocus(): void
}

function isFocusable(item: unknown): item is Focusable {
    return typeof item === "object" && item !== null && "forceActiveFocus" in item && typeof item.forceActiveFocus === "function"
}

// Gives the app the keys, as it comes.
export function focus(item: unknown): void {
    if (isFocusable(item)) item.forceActiveFocus()
}
