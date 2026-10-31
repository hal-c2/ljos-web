// The buttons that are rows of a view or of a menu: ItemDelegate and the
// ones with a check box, a radio button or a switch in them.
import { defineType } from "../../object.js";
import { AbstractButton } from "./AbstractButton.js";
import { checking } from "./CheckBox.js";
import { switching } from "./Switch.js";
import { speaks } from "../Accessible.js";

// A row does not take focus: the view it is in has it.
export const ItemDelegate = defineType("ItemDelegate", AbstractButton, {
  properties: { highlighted: false, focusPolicy: 0 },
});

export const CheckDelegate = defineType("CheckDelegate", ItemDelegate, checking);

export const RadioDelegate = defineType("RadioDelegate", ItemDelegate, {
  properties: { checkable: true, autoExclusive: true },
});

export const SwitchDelegate = defineType("SwitchDelegate", ItemDelegate, switching);

// A delegate that checks is named by its text as it is.
const text = (self) => String(self.text ?? "");
speaks(ItemDelegate, "ListItem");
speaks(CheckDelegate, "CheckBox", text, true);
speaks(RadioDelegate, "RadioButton", text, true);
speaks(SwitchDelegate, "Switch", text, true);
