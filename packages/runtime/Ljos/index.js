// `import Ljos`: what ljos-ui's `Ljos` module has besides Ljos.Ui and the
// others (its type table's `Ljos` module is the specification).
import { absent, defineType, QtObject } from "../object.ts";

// Which menu a translated "Window" menu is, for the menu bar of a system
// that lists its windows in one (macOS). Elsewhere the attached property
// does nothing, natively too, and a page has no such menu bar.
const Role = { TextHeuristicRole: 0, NoRole: 1, WindowRole: 2 };

const SystemMenuAttached = defineType("SystemMenu", QtObject, {
  enums: Role,
  properties: { role: Role.TextHeuristicRole },
});

export const SystemMenu = defineType("SystemMenu", QtObject, {
  enums: Role,
  attached: SystemMenuAttached,
});

// A supervision boundary and a scope for selecting text across items:
// the web has neither yet, and says so where one is used.
export const ErrorBoundary = /* @__PURE__ */ absent("Ljos", "ErrorBoundary");
export const SelectionScope = /* @__PURE__ */ absent("Ljos", "SelectionScope");
