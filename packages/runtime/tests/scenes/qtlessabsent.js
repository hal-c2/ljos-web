// A type of QtQuick3D.Effects that only an installed Qt has.
import { Item } from "ljos-web/QtQuick";
import { Blur } from "ljos-web/QtQuick3D/Effects";
import { make } from "../scene.js";

export const objects = {
  tried() {
    try {
      make(Blur, {});
      return "made";
    } catch (error) {
      return error.message;
    }
  },
};

export default () => make(Item, { width: 10, height: 10 });
