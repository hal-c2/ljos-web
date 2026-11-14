// Qt's numbers for keys, mouse buttons and keyboard modifiers, and what a DOM
// event says in them. The values are those of `qnamespace.h`; nothing here
// needs the `Qt` object.

export const NoModifier = 0;
export const ShiftModifier = 0x02000000;
export const ControlModifier = 0x04000000;
export const AltModifier = 0x08000000;
export const MetaModifier = 0x10000000;
export const KeypadModifier = 0x20000000;
export const KeyboardModifierMask = 0xfe000000;

export const NoButton = 0;
export const LeftButton = 1;
export const RightButton = 2;
export const MiddleButton = 4;
export const BackButton = 8;
export const ForwardButton = 16;
export const AllButtons = 0x07ffffff;

// `Qt::Key`, without the keys of one script or of one kind of device. A key
// that types a character is that character's code point, upper case.
export const Key = {
  Key_Escape: 0x01000000,
  Key_Tab: 0x01000001,
  Key_Backtab: 0x01000002,
  Key_Backspace: 0x01000003,
  Key_Return: 0x01000004,
  Key_Enter: 0x01000005,
  Key_Insert: 0x01000006,
  Key_Delete: 0x01000007,
  Key_Pause: 0x01000008,
  Key_Print: 0x01000009,
  Key_SysReq: 0x0100000a,
  Key_Clear: 0x0100000b,
  Key_Home: 0x01000010,
  Key_End: 0x01000011,
  Key_Left: 0x01000012,
  Key_Up: 0x01000013,
  Key_Right: 0x01000014,
  Key_Down: 0x01000015,
  Key_PageUp: 0x01000016,
  Key_PageDown: 0x01000017,
  Key_Shift: 0x01000020,
  Key_Control: 0x01000021,
  Key_Meta: 0x01000022,
  Key_Alt: 0x01000023,
  Key_CapsLock: 0x01000024,
  Key_NumLock: 0x01000025,
  Key_ScrollLock: 0x01000026,
  Key_F1: 0x01000030,
  Key_Super_L: 0x01000053,
  Key_Super_R: 0x01000054,
  Key_Menu: 0x01000055,
  Key_Hyper_L: 0x01000056,
  Key_Hyper_R: 0x01000057,
  Key_Help: 0x01000058,
  Key_Back: 0x01000061,
  Key_Forward: 0x01000062,
  Key_Stop: 0x01000063,
  Key_Refresh: 0x01000064,
  Key_VolumeDown: 0x01000070,
  Key_VolumeMute: 0x01000071,
  Key_VolumeUp: 0x01000072,
  Key_MediaPlay: 0x01000080,
  Key_MediaStop: 0x01000081,
  Key_MediaPrevious: 0x01000082,
  Key_MediaNext: 0x01000083,
  Key_MediaRecord: 0x01000084,
  Key_MediaPause: 0x01000085,
  Key_MediaTogglePlayPause: 0x01000086,
  Key_HomePage: 0x01000090,
  Key_Favorites: 0x01000091,
  Key_Search: 0x01000092,
  Key_Standby: 0x01000093,
  Key_LaunchMail: 0x010000a0,
  Key_Close: 0x010000ce,
  Key_Copy: 0x010000cf,
  Key_Cut: 0x010000d0,
  Key_Paste: 0x010000e2,
  Key_Save: 0x010000ea,
  Key_ZoomIn: 0x010000f6,
  Key_ZoomOut: 0x010000f7,
  Key_New: 0x01000120,
  Key_Open: 0x01000121,
  Key_Find: 0x01000122,
  Key_Undo: 0x01000123,
  Key_Redo: 0x01000124,
  Key_AltGr: 0x01001103,
  Key_Select: 0x01010000,
  Key_Yes: 0x01010001,
  Key_No: 0x01010002,
  Key_Cancel: 0x01020001,
  Key_Printer: 0x01020002,
  Key_Execute: 0x01020003,
  Key_Sleep: 0x01020004,
  Key_Play: 0x01020005,
  Key_Context1: 0x01100000,
  Key_Context2: 0x01100001,
  Key_Context3: 0x01100002,
  Key_Context4: 0x01100003,
  Key_Call: 0x01100004,
  Key_Hangup: 0x01100005,
  Key_Flip: 0x01100006,
  Key_Camera: 0x01100020,
  Key_unknown: 0x01ffffff,
  Key_Space: 0x20,
  Key_Asterisk: 0x2a,
  Key_NumberSign: 0x23,
};

// `KeyboardEvent.key`, for the keys that type nothing, as Qt's.
const NAMED: Record<string, number> = {
  Escape: Key.Key_Escape,
  Tab: Key.Key_Tab,
  Backspace: Key.Key_Backspace,
  Enter: Key.Key_Return,
  Insert: Key.Key_Insert,
  Delete: Key.Key_Delete,
  Pause: Key.Key_Pause,
  PrintScreen: Key.Key_Print,
  Clear: Key.Key_Clear,
  Home: Key.Key_Home,
  End: Key.Key_End,
  ArrowLeft: Key.Key_Left,
  ArrowUp: Key.Key_Up,
  ArrowRight: Key.Key_Right,
  ArrowDown: Key.Key_Down,
  PageUp: Key.Key_PageUp,
  PageDown: Key.Key_PageDown,
  Shift: Key.Key_Shift,
  Control: Key.Key_Control,
  Meta: Key.Key_Meta,
  OS: Key.Key_Meta,
  Alt: Key.Key_Alt,
  AltGraph: Key.Key_AltGr,
  CapsLock: Key.Key_CapsLock,
  NumLock: Key.Key_NumLock,
  ScrollLock: Key.Key_ScrollLock,
  Super: Key.Key_Super_L,
  Hyper: Key.Key_Hyper_L,
  ContextMenu: Key.Key_Menu,
  Help: Key.Key_Help,
  BrowserBack: Key.Key_Back,
  GoBack: Key.Key_Back,
  BrowserForward: Key.Key_Forward,
  BrowserStop: Key.Key_Stop,
  BrowserRefresh: Key.Key_Refresh,
  BrowserHome: Key.Key_HomePage,
  BrowserFavorites: Key.Key_Favorites,
  BrowserSearch: Key.Key_Search,
  AudioVolumeDown: Key.Key_VolumeDown,
  AudioVolumeMute: Key.Key_VolumeMute,
  AudioVolumeUp: Key.Key_VolumeUp,
  MediaPlay: Key.Key_MediaPlay,
  MediaStop: Key.Key_MediaStop,
  MediaTrackPrevious: Key.Key_MediaPrevious,
  MediaTrackNext: Key.Key_MediaNext,
  MediaRecord: Key.Key_MediaRecord,
  MediaPause: Key.Key_MediaPause,
  MediaPlayPause: Key.Key_MediaTogglePlayPause,
  Standby: Key.Key_Standby,
  LaunchMail: Key.Key_LaunchMail,
  Close: Key.Key_Close,
  Copy: Key.Key_Copy,
  Cut: Key.Key_Cut,
  Paste: Key.Key_Paste,
  Save: Key.Key_Save,
  ZoomIn: Key.Key_ZoomIn,
  ZoomOut: Key.Key_ZoomOut,
  New: Key.Key_New,
  Open: Key.Key_Open,
  Find: Key.Key_Find,
  Undo: Key.Key_Undo,
  Redo: Key.Key_Redo,
  Select: Key.Key_Select,
  Cancel: Key.Key_Cancel,
  Print: Key.Key_Printer,
  Execute: Key.Key_Execute,
  Play: Key.Key_Play,
  Call: Key.Key_Call,
  EndCall: Key.Key_Hangup,
  Camera: Key.Key_Camera,
};

// The key that types `text`: the code point of its upper case, which is
// where Qt puts the letters and all of Latin-1.
function typed(text: string): number {
  const upper = text.toUpperCase();
  // `ß` has no upper case of one character and is a key of its own.
  const one = upper.codePointAt(0);
  return upper.length === String.fromCodePoint(one!).length ? one! : text.codePointAt(0)!;
}

const single = (text: string): boolean => text.length === 1 || (text.length === 2 && text.codePointAt(0)! > 0xffff);

// A DOM key event's `Qt::Key`.
export function keyOf(event: KeyboardEvent): number {
  const key = event.key;
  if (single(key)) return typed(key);
  if (key === "Tab" && event.shiftKey) return Key.Key_Backtab;
  // The keypad's Enter is not the main one's Return.
  if (key === "Enter" && event.location === 3) return Key.Key_Enter;
  const named = NAMED[key];
  if (named !== undefined) return named;
  const f = /^F(\d+)$/.exec(key);
  if (f && +f[1]! >= 1 && +f[1]! <= 35) return Key.Key_F1 + Number(f[1]) - 1;
  return Key.Key_unknown;
}

const CONTROLS: Record<string, string> = { Enter: "\r", Tab: "\t", Backspace: "\b", Escape: "\x1b", Delete: "\x7f" };

// What the key types, as Qt's `text`: with Control held, a letter is its
// control character.
export function textOf(event: KeyboardEvent): string {
  const key = event.key;
  if (!single(key)) return CONTROLS[key] ?? "";
  if (event.ctrlKey && !event.altKey && /^[a-z@[\\\]^_]$/i.test(key)) {
    return String.fromCharCode(key.toUpperCase().charCodeAt(0) & 0x1f);
  }
  return key;
}

// A DOM key, mouse or wheel event's `Qt::KeyboardModifiers`.
export function modifiersOf(event: KeyboardEvent | MouseEvent): number {
  let modifiers = 0;
  if (event.shiftKey) modifiers |= ShiftModifier;
  if (event.ctrlKey) modifiers |= ControlModifier;
  if (event.altKey) modifiers |= AltModifier;
  if (event.metaKey) modifiers |= MetaModifier;
  if ((event as Partial<KeyboardEvent>).location === 3) modifiers |= KeypadModifier;
  return modifiers;
}

// `MouseEvent.button` as a `Qt::MouseButton`. The DOM counts the middle
// button before the right one; its `buttons` mask is already Qt's.
const BUTTONS = [LeftButton, MiddleButton, RightButton, BackButton, ForwardButton];
export const buttonOf = (event: MouseEvent): number => BUTTONS[event.button] ?? NoButton;

// `QKeySequence::StandardKey`.
export const StandardKey = Object.fromEntries(
  [
    "UnknownKey",
    "HelpContents",
    "WhatsThis",
    "Open",
    "Close",
    "Save",
    "New",
    "Delete",
    "Cut",
    "Copy",
    "Paste",
    "Undo",
    "Redo",
    "Back",
    "Forward",
    "Refresh",
    "ZoomIn",
    "ZoomOut",
    "Print",
    "AddTab",
    "NextChild",
    "PreviousChild",
    "Find",
    "FindNext",
    "FindPrevious",
    "Replace",
    "SelectAll",
    "Bold",
    "Italic",
    "Underline",
    "MoveToNextChar",
    "MoveToPreviousChar",
    "MoveToNextWord",
    "MoveToPreviousWord",
    "MoveToNextLine",
    "MoveToPreviousLine",
    "MoveToNextPage",
    "MoveToPreviousPage",
    "MoveToStartOfLine",
    "MoveToEndOfLine",
    "MoveToStartOfBlock",
    "MoveToEndOfBlock",
    "MoveToStartOfDocument",
    "MoveToEndOfDocument",
    "SelectNextChar",
    "SelectPreviousChar",
    "SelectNextWord",
    "SelectPreviousWord",
    "SelectNextLine",
    "SelectPreviousLine",
    "SelectNextPage",
    "SelectPreviousPage",
    "SelectStartOfLine",
    "SelectEndOfLine",
    "SelectStartOfBlock",
    "SelectEndOfBlock",
    "SelectStartOfDocument",
    "SelectEndOfDocument",
    "DeleteStartOfWord",
    "DeleteEndOfWord",
    "DeleteEndOfLine",
    "InsertParagraphSeparator",
    "InsertLineSeparator",
    "SaveAs",
    "Preferences",
    "Quit",
    "FullScreen",
    "Deselect",
    "DeleteCompleteLine",
    "Backspace",
    "Cancel",
  ].map((name, value) => [name, value]),
);

// What each standard key is, by its number, where Qt has no platform theme
// to ask: the first binding of each, as `Shortcut` takes it. Those bound
// only on another platform (`Quit`, `Preferences`) are empty.
const STANDARD =
  ";F1;Shift+F1;Ctrl+O;Ctrl+F4;Ctrl+S;Ctrl+N;Del;Ctrl+X;Ctrl+C;Ctrl+V;Ctrl+Z;Ctrl+Y;Alt+Left;Alt+Right;F5;Ctrl++;Ctrl+-;Ctrl+P;Ctrl+T;Ctrl+Tab;Ctrl+Shift+Backtab;Ctrl+F;F3;Shift+F3;Ctrl+H;Ctrl+A;Ctrl+B;Ctrl+I;Ctrl+U;Right;Left;Ctrl+Right;Ctrl+Left;Down;Up;PgDown;PgUp;Home;End;;;Ctrl+Home;Ctrl+End;Shift+Right;Shift+Left;Ctrl+Shift+Right;Ctrl+Shift+Left;Shift+Down;Shift+Up;Shift+PgDown;Shift+PgUp;Shift+Home;Shift+End;;;Ctrl+Shift+Home;Ctrl+Shift+End;Ctrl+Backspace;Ctrl+Del;;Enter;Shift+Enter;Ctrl+Shift+S;;;F11;;;;Esc".split(
    ";",
  );

// The names `QKeySequence` writes keys with, where they are not the key's
// character, and the ones it also reads.
const WRITTEN = {
  Space: Key.Key_Space,
  Esc: Key.Key_Escape,
  Tab: Key.Key_Tab,
  Backtab: Key.Key_Backtab,
  Backspace: Key.Key_Backspace,
  Return: Key.Key_Return,
  Enter: Key.Key_Enter,
  Ins: Key.Key_Insert,
  Del: Key.Key_Delete,
  Pause: Key.Key_Pause,
  Print: Key.Key_Print,
  SysReq: Key.Key_SysReq,
  Home: Key.Key_Home,
  End: Key.Key_End,
  Left: Key.Key_Left,
  Up: Key.Key_Up,
  Right: Key.Key_Right,
  Down: Key.Key_Down,
  PgUp: Key.Key_PageUp,
  PgDown: Key.Key_PageDown,
  CapsLock: Key.Key_CapsLock,
  NumLock: Key.Key_NumLock,
  ScrollLock: Key.Key_ScrollLock,
  Menu: Key.Key_Menu,
  Help: Key.Key_Help,
  Back: Key.Key_Back,
  Forward: Key.Key_Forward,
  Stop: Key.Key_Stop,
  Refresh: Key.Key_Refresh,
  "Volume Down": Key.Key_VolumeDown,
  "Volume Mute": Key.Key_VolumeMute,
  "Volume Up": Key.Key_VolumeUp,
  "Media Play": Key.Key_MediaPlay,
  "Media Stop": Key.Key_MediaStop,
  "Media Previous": Key.Key_MediaPrevious,
  "Media Next": Key.Key_MediaNext,
  "Media Pause": Key.Key_MediaPause,
};
const READ = { ...WRITTEN, Escape: Key.Key_Escape, Insert: Key.Key_Insert, Delete: Key.Key_Delete };
const BY_LOWER = Object.fromEntries(Object.keys(READ).map((name) => [name.toLowerCase(), READ[name as keyof typeof READ]]));
const NAMES = Object.fromEntries(Object.entries(WRITTEN).map(([name, key]) => [key, name]));

const MODIFIERS: Record<string, number> = { ctrl: ControlModifier, shift: ShiftModifier, alt: AltModifier, meta: MetaModifier, num: KeypadModifier };
// The order `QKeySequence` writes them in.
const ORDER: [modifier: number, name: string][] = [
  [MetaModifier, "Meta+"],
  [ControlModifier, "Ctrl+"],
  [AltModifier, "Alt+"],
  [ShiftModifier, "Shift+"],
  [KeypadModifier, "Num+"],
];

// One chord, `"Ctrl+Shift+Z"`, as a key and its modifiers; a standard key
// (a number) is its binding. Nothing for what is not a chord of one key.
// A key and the modifiers held with it.
export interface Chord {
  key: number;
  modifiers: number;
}

export function chord(sequence: unknown): Chord | null {
  if (typeof sequence === "number") sequence = STANDARD[sequence] ?? "";
  if (typeof sequence !== "string") return null;
  let rest = sequence.trim();
  // A comma that is not the key is between two chords.
  const comma = rest.indexOf(",");
  if (rest === "" || (comma >= 0 && comma < rest.length - 1)) return null;
  let modifiers = 0;
  for (;;) {
    // The key may be `+` itself: `Ctrl++`.
    const plus = rest.indexOf("+");
    if (plus <= 0 || plus === rest.length - 1) break;
    const modifier = MODIFIERS[rest.slice(0, plus).toLowerCase()];
    if (modifier === undefined) return null;
    modifiers |= modifier;
    rest = rest.slice(plus + 1);
  }
  let key = BY_LOWER[rest.toLowerCase()];
  if (key === undefined) {
    const f = /^F(\d+)$/i.exec(rest);
    if (f && +f[1]! >= 1 && +f[1]! <= 35) key = Key.Key_F1 + Number(f[1]) - 1;
    else if (single(rest)) key = typed(rest);
    else return null;
  }
  return { key, modifiers };
}

// A chord as `QKeySequence` writes it.
export function chordText({ key, modifiers }: Chord): string {
  let text = "";
  for (const [modifier, name] of ORDER) if (modifiers & modifier) text += name;
  if (NAMES[key]) return text + NAMES[key];
  if (key >= Key.Key_F1 && key < Key.Key_F1 + 35) return `${text}F${key - Key.Key_F1 + 1}`;
  return text + String.fromCodePoint(key);
}

// Whether a key event is the chord. Shift with Tab is Backtab to Qt, under
// either name; a character typed with Shift is that character with or
// without it, since the sequence `Ctrl++` cannot know the layout.
export function chordMatches(wanted: Chord, key: number, modifiers: number): boolean {
  const held = modifiers & ~KeypadModifier;
  const asked = wanted.modifiers & ~KeypadModifier;
  const tab = (code: number): number => (code === Key.Key_Backtab ? Key.Key_Tab : code);
  if (tab(wanted.key) !== tab(key)) return false;
  if (held === asked) return true;
  if (!(held & ShiftModifier) || (held & ~ShiftModifier) !== asked) return false;
  return key === Key.Key_Backtab || (key < 0x01000000 && !(key >= 0x41 && key <= 0x5a));
}
