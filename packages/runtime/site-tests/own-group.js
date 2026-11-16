// Runs a command in a process group of its own that ends with whoever
// started it. A detached group outlives its starter: if the starter dies
// before it can kill the group, nothing reaps it. So this, the group's
// leader, holds the starter's end of a pipe on stdin, which closes however
// the starter ends (killed included), and kills the whole group when it
// does.
//
//   spawn(process.execPath, [ownGroup, command, ...args], { detached: true, stdio: ["pipe", …] })
//
// The starter never writes to that pipe. The command's status is this
// process's, 128 + the signal's number if a signal ended it.
import { spawn } from "node:child_process";
import { constants } from "node:os";

const [command, ...args] = process.argv.slice(2);
const child = spawn(command, args, { stdio: ["ignore", "inherit", "inherit"] });
process.stdin.on("end", () => process.kill(-process.pid, "SIGKILL"));
process.stdin.resume();
child.on("error", (error) => {
  console.error(`${command}: ${error.message}`);
  process.exit(1);
});
child.on("exit", (status, signal) => process.exit(status ?? 128 + constants.signals[signal]));
