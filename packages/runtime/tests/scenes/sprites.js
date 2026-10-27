// The scenes of `sprites.spec.js`: `?scene=sprites&part=<name>` is
// `sprites/<name>.qml`, with time standing still before anything plays.
import { clock } from "ljos-web/QtQuick";
import { make } from "../scene.js";

const parts = import.meta.glob("./sprites/*.qml", { eager: true });
const part = new URLSearchParams(location.search).get("part");

export const objects = { clock };

export default function Sprites(props) {
  clock.stop();
  return (objects.scene = make(parts[`./sprites/${part}.qml`].default, props));
}
