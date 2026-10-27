// A module of Qt's that is partly QML: `tests/qt` stands for the Qt that is
// installed, and has a style or two of a module the runtime has nothing of.
import { $object } from "ljos-web/object";
import { Item, Text } from "ljos-web/QtQuick";
import { FlexboxLayout, Flexed, Rack, RowLayout } from "ljos-web/QtQuick/Layouts";
import { LightmapperOutputWindow } from "ljos-web/QtQuick3D";
import * as Shelves from "ljos-web/QtShelf";
import { make } from "../scene.js";

const { Shelf } = Shelves;
const shelf = $object();
const rack = $object();

export const objects = { shelf, rack, Shelf, Text, RowLayout, FlexboxLayout, Flexed, LightmapperOutputWindow, make, names: Object.keys(Shelves) };

export default () =>
  make(Item, { width: 400, height: 300 }, () => [
    make(Rack, { $self: rack }),
    make(Shelf, { $self: shelf, elide: Shelf.ElideRight }),
  ]);
