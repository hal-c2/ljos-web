// The scenes of `painters.spec.js`: `?scene=painters&part=<name>` is
// `<name>.qml`, with time standing still so that the test says when it is.
import { clock } from "ljos-web/QtQuick";
import { make } from "../scene.js";

const parts = import.meta.glob(["./painted.qml", "./moving.qml"], { eager: true });
const part = new URLSearchParams(location.search).get("part");

export const objects = { clock };

export default function Painters(props) {
  clock.stop();
  return (objects.scene = make(parts[`./${part}.qml`].default, props));
}
