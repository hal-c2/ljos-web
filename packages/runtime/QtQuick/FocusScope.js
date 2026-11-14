// FocusScope: an item whose children settle among themselves which of them
// has focus, so that the scope can be given it as a whole (focus.js).
import { defineType } from "../object.ts";
import { Item } from "./Item.js";

export const FocusScope = defineType("FocusScope", Item, {
  methods: { $focusScope: true },
});
