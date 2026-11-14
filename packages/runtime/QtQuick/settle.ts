// What a method does once it has changed something: what depends on the
// change is up to date when the method returns, as it is in QML. A method
// that a change handler calls is already inside a flush, where asking for
// another is refused, and the kernel knows when that is.
export { settle } from "../object.ts";
