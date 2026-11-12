// The page a build draws pictures in (`renderPictures` in build.js):
// it compiles the example it is given with the compiler in the page,
// mounts it as a reader's page would, and answers a picture of it.
import "../style.css";
import { compile } from "../compiler/index.js";
import { mount } from "../object.js";
import { picture } from "../picture.js";

const base64 = (bytes) => {
  let text = "";
  for (let at = 0; at < bytes.length; at += 32768)
    text += String.fromCharCode(...bytes.subarray(at, at + 32768));
  return btoa(text);
};

let mounted;
window.renderBlock = async ({ files, entry }) => {
  try {
    const made = await compile({ files, entry });
    if (made.diagnostics) return made;
    const stage = document.getElementById("stage");
    mounted?.dispose?.();
    stage.replaceChildren();
    mounted = mount(made.component, stage);
    const { object } = mounted;
    // A root that only says its implicit size (a Column of two Texts)
    // is pictured at that size, as a window of it would open at it.
    if (!(object.width >= 1) && object.implicitWidth >= 1) object.width = object.implicitWidth;
    if (!(object.height >= 1) && object.implicitHeight >= 1) object.height = object.implicitHeight;
    // One frame laid out and painted, as a reader first sees it.
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    const drawn = await picture(object, { scale: 2 });
    if (drawn.error) return { diagnostics: [{ file: entry, message: drawn.message }] };
    return { png: base64(drawn.png), width: Math.round(object.width), height: Math.round(object.height) };
  } catch (error) {
    // An example that throws as it is made did not run: that is its
    // answer, with the page's words, not the build's end.
    return { diagnostics: [{ file: entry, message: error?.message ?? String(error) }] };
  }
};
window.ready = true;
