// A control's part (`background`, `contentItem`, `indicator`): an item, or a
// `Component` of one, which is how a style may give it (`background:
// Component { Rectangle {} }`, as Ljós's own styles do). The control makes
// that item itself, once, as its own child, and the property holds the item:
// what the control computes from its parts reads an item either way. One an
// application gives in its place is all there is: the style's is never made.
// Here and not in object.ts, so a page with no controls carries none of it.
import { apart, typed } from "../../object.ts";

const part = (value) => value;
part.type = "QQuickItem*";
// Made apart from the binding that gave it, and ended with it, as an item
// written there is.
part.made = (value) => (value?.$component ? apart(() => value({}))() : value);

// What a Template declares its parts as: none until the style gives one.
export const parts = typed(part, null);
