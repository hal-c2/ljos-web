// SwipeView: a container whose items are pages, each as big as the view,
// one beside the next. The style's ListView is what is swiped.
import { defineType, derived, effect, QtObject, slot } from "../../object.js";
import { reachable } from "../focus.js";
import { containerOf, Container, indexOf } from "./Container.js";
import { untrack } from "#kernel";

const Horizontal = 1;
const Vertical = 2;

const isSwipeView = (item) => item?.$type.chain.includes(SwipeView);

// Where the page is from the current one: 0 for it, 1 for the one after.
function ahead(self) {
  const index = self.index;
  const current = self.view?.currentIndex ?? -1;
  return index === -1 || current === -1 ? NaN : index - current;
}

const SwipeViewAttached = defineType("SwipeViewAttached", QtObject, {
  properties: {
    index: derived((self) => (self.view ? indexOf(self.$of) : -1)),
    view: derived((self) => {
      const view = containerOf(self.$of);
      return isSwipeView(view) ? view : null;
    }),
    isCurrentItem: derived((self) => ahead(self) === 0),
    isNextItem: derived((self) => ahead(self) === 1),
    isPreviousItem: derived((self) => ahead(self) === -1),
  },
  setup(self, props) {
    self.$of = props.$attachee;
  },
});

export const SwipeView = defineType("SwipeView", Container, {
  properties: {
    interactive: true,
    orientation: Horizontal,
    horizontal: derived((self) => self.orientation === Horizontal),
    vertical: derived((self) => self.orientation === Vertical),
    activeFocusOnTab: true,
  },
  attached: SwipeViewAttached,
  methods: {
    $focusScope: true,
    // As big as the page shown would like to be.
    $contentWidth() {
      return this.currentItem?.implicitWidth ?? 0;
    },
    $contentHeight() {
      return this.currentItem?.implicitHeight ?? 0;
    },
    // A page is as big as the others before the view is told of it: the
    // view puts those after it by how big it is.
    $adding(page) {
      const item = untrack(() => this.contentItem);
      if (!item) return;
      slot(page, "width").place(untrack(() => item.width));
      slot(page, "height").place(untrack(() => item.height));
    },
  },
  setup(self) {
    reachable(self);
    effect(
      () => {
        const item = self.contentItem;
        if (!item) return null;
        // A view puts its rows one after another itself.
        return [self.contentChildren, item.width, item.height, item.$v ? null : self.spacing, self.orientation];
      },
      (layout) => {
        if (!layout) return;
        const [pages, width, height, spacing, orientation] = layout;
        for (let index = 0; index < pages.length; index++) {
          const page = pages[index];
          slot(page, "width").place(width);
          slot(page, "height").place(height);
          if (spacing === null) continue;
          slot(page, "x").place(orientation === Horizontal ? index * (width + spacing) : 0);
          slot(page, "y").place(orientation === Horizontal ? 0 : index * (height + spacing));
        }
      },
    );
  },
});
