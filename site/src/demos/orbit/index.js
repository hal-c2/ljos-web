import { capable, mountDemo } from "../../islands/mount.js";
import Demo from "./Orbit.qml";

export default (el) => {
  capable(["gpu"]);
  return mountDemo(Demo, el);
};
