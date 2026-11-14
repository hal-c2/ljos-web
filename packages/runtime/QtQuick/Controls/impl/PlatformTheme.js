// PlatformTheme: what the platform a program runs on prefers. A browser
// says little of it; what it does say is what `Qt.styleHints` has.
import { styleHints } from "../../../QtQml/application.ts";

const HINTS = [
  "CursorFlashTime",
  "KeyboardInputInterval",
  "MouseDoubleClickInterval",
  "StartDragDistance",
  "StartDragTime",
  "KeyboardAutoRepeatRate",
  "PasswordMaskDelay",
  "StartDragVelocity",
  "TextCursorWidth",
  "DropShadow",
  "MaximumScrollBarDragDistance",
  "ToolButtonStyle",
  "ToolBarIconSize",
  "ItemViewActivateItemOnSingleClick",
  "SystemIconThemeName",
  "SystemIconFallbackThemeName",
  "IconThemeSearchPaths",
  "StyleNames",
  "WindowAutoPlacement",
  "DialogButtonBoxLayout",
  "DialogButtonBoxButtonsHaveIcons",
  "UseFullScreenForPopupMenu",
  "KeyboardScheme",
  "UiEffects",
  "SpellCheckUnderlineStyle",
  "TabFocusBehavior",
  "IconPixmapSizes",
  "PasswordMaskCharacter",
  "DialogSnapToDefaultButton",
  "ContextMenuOnMouseRelease",
  "MousePressAndHoldInterval",
  "MouseDoubleClickDistance",
  "WheelScrollLines",
  "TouchDoubleTapDistance",
  "ShowShortcutsInContextMenus",
  "IconFallbackSearchPaths",
  "MouseQuickSelectionThreshold",
  "InteractiveResizeAcrossScreens",
  "ShowDirectoriesFirst",
  "PreselectFirstFileInDirectory",
  "ButtonPressKeys",
  "SetFocusOnTouchRelease",
  "FlickStartDistance",
  "FlickMaximumVelocity",
  "FlickDeceleration",
  "MenuBarFocusOnAltPressRelease",
  "MouseCursorTheme",
  "MouseCursorSize",
  "UnderlineShortcut",
  "ShowIconsInMenus",
  "PreferFileIconFromTheme",
  "MenuSelectionWraps",
  "ScrollSingleStepDistance",
];
const Hint = Object.fromEntries(HINTS.map((name, index) => [name, index]));

// The hints `Qt.styleHints` answers, by the name it has them under.
const STYLE = {
  CursorFlashTime: "cursorFlashTime",
  KeyboardInputInterval: "keyboardInputInterval",
  MouseDoubleClickInterval: "mouseDoubleClickInterval",
  StartDragDistance: "startDragDistance",
  StartDragTime: "startDragTime",
  KeyboardAutoRepeatRate: "keyboardAutoRepeatRate",
  PasswordMaskDelay: "passwordMaskDelay",
  StartDragVelocity: "startDragVelocity",
  TabFocusBehavior: "tabFocusBehavior",
  PasswordMaskCharacter: "passwordMaskCharacter",
  MousePressAndHoldInterval: "mousePressAndHoldInterval",
  MouseDoubleClickDistance: "mouseDoubleClickDistance",
  WheelScrollLines: "wheelScrollLines",
  TouchDoubleTapDistance: "touchDoubleTapDistance",
  ShowShortcutsInContextMenus: "showShortcutsInContextMenus",
  MouseQuickSelectionThreshold: "mouseQuickSelectionThreshold",
  SetFocusOnTouchRelease: "setFocusOnTouchRelease",
  MenuSelectionWraps: "menuSelectionWraps",
};

// Qt's own answers for what a platform has nothing to say about.
const USUAL = {
  TextCursorWidth: 1,
  DropShadow: false,
  MaximumScrollBarDragDistance: -1,
  ItemViewActivateItemOnSingleClick: false,
  DialogButtonBoxButtonsHaveIcons: false,
  UseFullScreenForPopupMenu: false,
  DialogSnapToDefaultButton: false,
  ContextMenuOnMouseRelease: false,
  InteractiveResizeAcrossScreens: true,
  ShowDirectoriesFirst: true,
  PreselectFirstFileInDirectory: false,
  MenuBarFocusOnAltPressRelease: false,
  UnderlineShortcut: true,
  ShowIconsInMenus: true,
  PreferFileIconFromTheme: false,
};

export const PlatformTheme = Object.freeze({
  ...Hint,
  themeHint(hint) {
    const name = HINTS[hint];
    return name in STYLE ? styleHints()[STYLE[name]] : USUAL[name];
  },
});
