// `import QtWebSockets`: QML's WebSocket, over the browser's own.
//
// It is open while it is `active` and has somewhere to connect to, and says
// in `status` how far along that is, every step of the way as Qt does. Two
// things a browser keeps to itself: why a connection failed, and pings,
// which it answers and never sends.
import { onCleanup } from "solid-js";
import { defineType, QtObject, settle, slot, whenComplete } from "../object.js";
import { untrack } from "#kernel";

const CONNECTING = 0;
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;
const ERROR = 4;

// Each step is told of before the next is taken.
function write(self, name, value) {
  slot(self, name).write(value);
  settle();
}

function fail(self, message) {
  write(self, "errorString", message);
  write(self, "status", ERROR);
}

// The connection is over: closing first if it was open, as Qt says it.
function ended(self) {
  self.$socket = null;
  if (untrack(() => self.status) === OPEN) write(self, "status", CLOSING);
  write(self, "negotiatedSubprotocol", "");
  write(self, "status", CLOSED);
}

function open(self, url) {
  write(self, "errorString", "");
  write(self, "status", CONNECTING);
  write(self, "negotiatedSubprotocol", "");
  let socket;
  try {
    socket = new window.WebSocket(url, untrack(() => self.requestedSubprotocols) ?? []);
  } catch (error) {
    write(self, "status", CLOSED);
    return fail(self, String(error?.message ?? error));
  }
  self.$socket = socket;
  socket.binaryType = "arraybuffer";
  // One that was replaced or let go of says nothing more.
  const current = () => self.$socket === socket;
  let failed = false;
  socket.onopen = () => {
    if (!current()) return;
    write(self, "status", OPEN);
    write(self, "negotiatedSubprotocol", socket.protocol);
  };
  socket.onmessage = ({ data }) => {
    if (!current()) return;
    if (typeof data === "string") self.textMessageReceived(data);
    else self.binaryMessageReceived(data);
    settle();
  };
  socket.onerror = () => {
    failed = true;
  };
  socket.onclose = () => {
    if (!current()) return;
    ended(self);
    if (failed) fail(self, "Connection failed");
  };
}

// Closes what is open. Qt says so once the other side has agreed, and of
// one that was still connecting at once.
function close(self) {
  const socket = self.$socket;
  if (!socket) return;
  if (socket.readyState === window.WebSocket.OPEN) {
    socket.onerror = null;
    socket.close();
  } else {
    drop(self);
    ended(self);
  }
}

// Lets go of the connection without a word of it.
function drop(self) {
  const socket = self.$socket;
  self.$socket = null;
  if (socket) socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
  socket?.close();
}

// How many bytes were sent, or none and why not.
function send(self, data, size) {
  if (untrack(() => self.status) !== OPEN) {
    fail(self, "Messages can only be sent when the socket is open.");
    return 0;
  }
  self.$socket.send(data);
  return size;
}

export const WebSocket = defineType("WebSocket", QtObject, {
  properties: {
    url: "",
    requestedSubprotocols: [],
    active: false,
    status: CLOSED,
    errorString: "QQmlWebSocket is not ready.",
    negotiatedSubprotocol: "",
  },
  signals: ["textMessageReceived", "binaryMessageReceived", "pong"],
  enums: { Connecting: CONNECTING, Open: OPEN, Closing: CLOSING, Closed: CLOSED, Error: ERROR },
  methods: {
    sendTextMessage(message) {
      const text = String(message);
      return send(this, text, new TextEncoder().encode(text).length);
    },
    sendBinaryMessage(message) {
      return send(this, message, message?.byteLength ?? 0);
    },
    // A browser sends no pings of a page's: `pong` is never emitted.
    ping() {},
  },
  setup(self) {
    self.$socket = null;
    onCleanup(() => drop(self));
    // Open while it is active and has somewhere to connect to. A change to
    // either is told of before what the socket makes of it is, as in Qt.
    const follow = () => {
      const [active, url] = untrack(() => [self.active, String(self.url ?? "")]);
      if (!active || !url) return close(self);
      // Somewhere else to connect to: the connection there replaces this.
      drop(self);
      open(self, url);
    };
    self.activeChanged.connect(follow);
    self.urlChanged.connect(follow);
    whenComplete(follow);
  },
});
