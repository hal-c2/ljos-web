import { capable, mountDemo } from "../../islands/mount.js";
import Demo from "./Shader.qml";

export default (el) => {
  capable(["webgl"]);
  return mountDemo(Demo, el);
};
