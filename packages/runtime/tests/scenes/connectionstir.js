// `connectionflush.qml` with an asker of every write that throws, and one
// after it that counts how often it is asked: the first's throw is not the
// write's, nor the second's to miss.
import { onEveryWrite } from "ljos-web/object";
import Connectionflush from "./connectionflush.qml";

let asked = 0;
onEveryWrite(() => {
  throw new Error("an asker broke");
});
onEveryWrite(() => {
  asked += 1;
});

export const objects = { asked: () => asked };
export default Connectionflush;
