// TumblerView: the content item the styles give a Tumbler. It makes the
// view the tumbler turns, and makes another when the tumbler wraps or stops
// wrapping: a PathView along `path` for one that does, a ListView for one
// that does not.
import { onCleanup } from "solid-js";
import { defineType, effect, instantiate, slot } from "../../../object.js";
import { Item } from "../../Item.js";
import { ListView } from "../../ListView.js";
import { PathView } from "../../PathView.js";
import { untrack } from "#kernel";

// A row is as big as the tumbler has it from when it is made: the view lays
// it out as that, as Qt's does, and the tumbler sees to it after.
function sized(self, tumbler) {
  let from;
  let made;
  return () => {
    const delegate = self.delegate;
    if (delegate === from) return made;
    from = delegate;
    made =
      typeof delegate !== "function"
        ? delegate
        : (row) => {
            const item = delegate(row);
            if (item?.$node) {
              untrack(() => {
                slot(item, "width").place(tumbler.availableWidth);
                slot(item, "height").place(tumbler.availableHeight / tumbler.visibleItemCount);
              });
            }
            return item;
          };
    return made;
  };
}

// What either view has: the size of the TumblerView, its rows, and the
// tumbler's say in how a flick slows.
const shared = (self, tumbler, delegate = sized(self, tumbler)) => ({
  get width() {
    return self.width;
  },
  get height() {
    return self.height;
  },
  get model() {
    return self.model;
  },
  get delegate() {
    return delegate();
  },
  get flickDeceleration() {
    return tumbler.flickDeceleration;
  },
  clip: true,
});

// One row more than is seen is on the path: half of it at either end.
const wheel = (self, tumbler) => () =>
  PathView(
    Object.defineProperties(shared(self, tumbler), {
      path: { get: () => self.path, enumerable: true },
      pathItemCount: { get: () => tumbler.visibleItemCount + 1, enumerable: true },
      dragMargin: { get: () => self.width / 2, enumerable: true },
      preferredHighlightBegin: { value: 0.5, enumerable: true },
      preferredHighlightEnd: { value: 0.5, enumerable: true },
      highlightMoveDuration: { value: 1000, enumerable: true },
    }),
  );

// The current row is in the middle, as high as one of those seen. Qt says
// that the range is enforced once the list has its rows and is at the
// tumbler's: it starts inside its content, and is in the range only when
// something changes.
const list = (self, tumbler) => () =>
  ListView(
    Object.defineProperties(shared(self, tumbler), {
      currentIndex: { value: tumbler.$tumbler.start(), enumerable: true },
      $lax: { value: true, enumerable: true },
      snapMode: { value: ListView.SnapToItem, enumerable: true },
      highlightRangeMode: { value: ListView.StrictlyEnforceRange, enumerable: true },
      preferredHighlightBegin: {
        get: () => self.height / 2 - self.height / tumbler.visibleItemCount / 2,
        enumerable: true,
      },
      preferredHighlightEnd: {
        get: () => self.height / 2 + self.height / tumbler.visibleItemCount / 2,
        enumerable: true,
      },
    }),
  );

export const TumblerView = defineType("TumblerView", Item, {
  properties: {
    model: undefined,
    delegate: undefined,
    path: null,
  },
  setup(self) {
    let made = null;
    let of = null;
    let wraps = false;
    const drop = () => {
      if (!made) return;
      self.$remove(made.object);
      made.dispose();
      made = null;
    };
    onCleanup(drop);
    effect(
      () => {
        // Its tumbler is the item it is the content of.
        const tumbler = self.parent;
        return tumbler?.$tumbler && tumbler.contentItem === self ? [tumbler, tumbler.wrap] : [null, false];
      },
      ([tumbler, wrap]) =>
        untrack(() => {
          // Asked again for the same: the view it has is the one.
          if (tumbler === of && wrap === wraps) return;
          of = tumbler;
          wraps = wrap;
          drop();
          if (!tumbler) return;
          made = instantiate((wrap ? wheel : list)(self, tumbler), undefined, self);
          self.$add(made.object);
        }),
    );
  },
});
