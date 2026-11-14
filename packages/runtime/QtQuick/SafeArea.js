// SafeArea: how far in from an item's edges what matters has to stay, clear
// of a phone's notch and rounded corners. A page is laid out inside those
// already, so there is nothing to stay clear of.
import { defineType, QtObject } from "../object.ts";

const NONE = Object.freeze({ top: 0, left: 0, right: 0, bottom: 0 });

const SafeAreaAttached = defineType("SafeAreaAttached", QtObject, {
  properties: { margins: NONE, additionalMargins: NONE },
});

export const SafeArea = defineType("SafeArea", QtObject, { attached: SafeAreaAttached });
