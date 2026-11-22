// Host JavaScript, for the one thing the strict TypeScript of stage.ts
// cannot say: the names of a value whose shape is not known. The checker
// has no `Object` and forbids `for…in`. What it is, keys.d.mts declares.
export function keys(value) {
    return Object.keys(value);
}
