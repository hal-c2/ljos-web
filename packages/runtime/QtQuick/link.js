// An item that is a link: one whose `Accessible.role` is `Link`. Its
// element is an `a`, and the address its `href` property holds is the
// element's `href`, so the page is a page of links before any script
// runs (prerendered), and after: a crawler follows it, a reader opens
// it in a new tab or copies it, a screen reader lists it. What a
// plain press does is still the program's (pointer.js).
import { untrack } from "#kernel";
import { shellShown } from "../guard.js";
import { effect } from "../object.js";
import { followable } from "./richtext.js";

const LINK = 30;

// The element's tag is chosen as the item is made, from its role as
// written then: a page prerendered and the same page hydrated choose
// alike, which is what lets hydration take the prerendered `a` over.
export function tagOf(props) {
  try {
    return untrack(() => props["Accessible$role"]) === LINK ? "a" : "div";
  } catch {
    // A role bound to what is not made yet is not a link's from the start.
    return "div";
  }
}

// What the item's `href` says, while it says something a page can
// follow; anything else (a script, data) leaves the link without one,
// as rich text's links are left (richtext.js), and so does a shell a
// visitor dropped being shown: what it wrote is followed by nobody.
export function addressed(self, node) {
  if (node.localName !== "a") return;
  effect(
    () => (shellShown() || self.href === undefined || self.href === null ? "" : String(self.href)),
    (href) => {
      if (href && followable(href)) node.setAttribute("href", href); // guarded
      else node.removeAttribute("href");
    },
  );
}
