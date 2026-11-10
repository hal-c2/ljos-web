// Ljós's own QML of QtQuick3D.Helpers and QtQuick3D.Effects, laid out as a
// directory of Qt's QML modules is, so that a page of 3D builds where no Qt
// is installed (`controls.js` is the same for Qt Quick Controls).
//
// Four files of Helpers are ljos-ui's, copied at the one commit
// `quick3d/LJOS_UI.json` names with a hash of each; its `changed` says which
// differ from that commit and why (what a running Qt shows). The rest was
// written here from Qt's public documentation. None is ever read from Qt.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const QUICK3D = join(import.meta.dirname, "quick3d");

// What is wrong with the copy against what it says it was copied from.
export function check(root = QUICK3D) {
  const { rev, files, changed } = JSON.parse(readFileSync(join(root, "LJOS_UI.json"), "utf8"));
  const hash = (file) => createHash("sha256").update(readFileSync(join(root, file))).digest("hex");
  const problems = [];
  for (const [file, sum] of Object.entries(files)) {
    if (hash(file) !== sum) problems.push(`${file} is not as ljos-ui has it at ${rev}`);
  }
  for (const [file, { sha256 }] of Object.entries(changed)) {
    if (hash(file) !== sha256) problems.push(`${file} is not as its change says`);
  }
  return problems;
}
