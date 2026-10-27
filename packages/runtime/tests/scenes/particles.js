// The scenes of `particles.spec.js`: `?scene=particles&part=<name>` is
// `particles/<name>.qml`, with time standing still before its system starts.
// What the root has aliases for is what a test reads.
import { clock } from "ljos-web/QtQuick";
import { make } from "../scene.js";

const parts = import.meta.glob("./particles/*.qml", { eager: true });
const part = new URLSearchParams(location.search).get("part");

// The particles of a group as they are now, oldest first.
function live(system, group = "") {
  const sim = system.$sim;
  const { data, used, color, spin, high } = sim.group(group);
  const time = sim.now / 1000;
  const found = [];
  for (let index = 0; index < high; index++) {
    if (!used[index]) continue;
    const [x, y, vx, vy, ax, ay, t, life, size, endSize] = data.subarray(index * 10, index * 10 + 10);
    const age = time - t;
    found.push({
      t,
      life,
      age,
      x: x + vx * age + 0.5 * ax * age * age,
      y: y + vy * age + 0.5 * ay * age * age,
      vx: vx + ax * age,
      vy: vy + ay * age,
      size,
      endSize,
      color: Array.from(color.subarray(index * 4, index * 4 + 4)),
      rotation: spin[index * 2],
    });
  }
  return found.sort((a, b) => a.t - b.t);
}

// Read back from a copy: the painter's canvas is one that is drawn to.
const copy = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
copy.canvas.width = copy.canvas.height = 1;

// The colour of a painter's canvas at a point of the system, as bytes.
function pixel(painter, x, y) {
  const canvas = painter.$canvas;
  if (!canvas.width) return [0, 0, 0, 0];
  const [left, top, width, , a, b, c, d, e, f] = painter.$region;
  const ratio = canvas.width / width;
  const column = Math.floor((a * x + c * y + e - left) * ratio);
  const row = Math.floor((b * x + d * y + f - top) * ratio);
  copy.clearRect(0, 0, 1, 1);
  copy.drawImage(canvas, column, row, 1, 1, 0, 0, 1, 1);
  return Array.from(copy.getImageData(0, 0, 1, 1).data);
}

export const objects = { clock, live, pixel };

export default function Particles(props) {
  clock.stop();
  return (objects.scene = make(parts[`./particles/${part}.qml`].default, props));
}
