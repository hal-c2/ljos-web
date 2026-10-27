// A module of Qt's whose QML comes to one with a style, for a file that is
// of a style: and a module that is elsewhere than the rest of Qt.
import { $object } from "ljos-web/object";
import { Cabinet } from "ljos-web/QtCabinet";
import { make } from "../scene.js";

const cabinet = $object();

export const objects = { cabinet, make };

export default () => make(Cabinet, { $self: cabinet });
