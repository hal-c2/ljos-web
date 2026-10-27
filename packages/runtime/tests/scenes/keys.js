// Item {
//     id: root; width: 400; height: 300
//     Keys.onPressed: (event) => log.push("root pressed " + event.key)
//     Item {
//         id: first; focus: true
//         onFocusChanged: log.push("first focus " + focus)
//         onActiveFocusChanged: log.push("first active " + activeFocus)
//     }
//     Item {
//         id: second; focus: true
//         onFocusChanged: log.push("second focus " + focus)
//         onActiveFocusChanged: log.push("second active " + activeFocus)
//         Keys.onPressed: (event) => log.push(`second pressed key=${event.key} text='${event.text}' mod=${event.modifiers} rep=${event.isAutoRepeat} acc=${event.accepted}`)
//         Keys.onReleased: (event) => log.push(`second released key=${event.key} acc=${event.accepted}`)
//         Keys.onReturnPressed: (event) => log.push("second return acc=" + event.accepted)
//         Keys.onLeftPressed: (event) => { log.push("second left"); event.accepted = false }
//         Keys.onDigit1Pressed: (event) => log.push("second digit1")
//         Keys.onSpacePressed: log.push("second space")
//         Keys.onTabPressed: (event) => { log.push("second tab"); event.accepted = false }
//     }
//     Item {
//         id: third; focus: true
//         Item {
//             id: nested; focus: true
//             Keys.onPressed: (event) => { log.push("nested pressed " + event.key); if (event.key === Qt.Key_C) event.accepted = true }
//         }
//         Keys.onPressed: (event) => log.push("third pressed " + event.key)
//     }
//     FocusScope {
//         id: scope
//         onFocusChanged: log.push("scope focus " + focus)
//         onActiveFocusChanged: log.push("scope active " + activeFocus)
//         Keys.onPressed: (event) => log.push("scope pressed " + event.key)
//         Item {
//             id: inScopeA; focus: true
//             onActiveFocusChanged: log.push("inScopeA active " + activeFocus)
//             onFocusChanged: log.push("inScopeA focus " + focus)
//             Keys.onPressed: (event) => log.push("inScopeA pressed " + event.key)
//             KeyNavigation.right: inScopeB
//             KeyNavigation.tab: inScopeB
//         }
//         Item {
//             id: inScopeB
//             onFocusChanged: log.push("inScopeB focus " + focus)
//             onActiveFocusChanged: log.push("inScopeB active " + activeFocus)
//             Keys.onPressed: (event) => log.push("inScopeB pressed " + event.key)
//         }
//     }
//     FocusScope {
//         id: scope2
//         Item { id: s2a; activeFocusOnTab: true; width: 10; height: 10 }
//         Item { id: s2b; activeFocusOnTab: true; focus: true; width: 10; height: 10 }
//         Item { id: s2c; activeFocusOnTab: true; width: 10; height: 10; visible: false }
//         Item {
//             id: s2d; activeFocusOnTab: true; width: 10; height: 10
//             Item { id: s2e; activeFocusOnTab: true; width: 10; height: 10 }
//         }
//         Item { id: s2f; width: 10; height: 10 }
//     }
//     Item {
//         id: fwd
//         Keys.forwardTo: [fwdTarget]
//         Keys.onPressed: (event) => log.push("fwd pressed " + event.key)
//     }
//     Item {
//         id: fwdTarget
//         Keys.onPressed: (event) => { log.push("fwdTarget pressed " + event.key); if (event.key === Qt.Key_B) event.accepted = true }
//     }
//     Item {
//         id: after
//         Keys.priority: Keys.AfterItem
//         Keys.onPressed: (event) => log.push("after pressed")
//     }
//     Item {
//         id: muted
//         Keys.enabled: false
//         Keys.onPressed: (event) => log.push("muted pressed")
//     }
//     Shortcut { sequence: "Ctrl+K"; onActivated: log.push("shortcut ctrl+k") }
//     Shortcut { sequences: ["Ctrl+J", "F5"]; onActivated: log.push("shortcut j/f5") }
//     Shortcut { id: opener; sequence: StandardKey.Open; onActivated: log.push("shortcut open") }
//     Shortcut { id: letter; sequence: "A"; onActivated: log.push("shortcut A") }
//     Shortcut { sequence: "Ctrl+D"; onActivatedAmbiguously: log.push("one of two") }
//     Shortcut { sequence: "Ctrl+D"; onActivatedAmbiguously: log.push("other of two") }
// }
import { $object } from "ljos-web/object";
import { FocusScope, Item, KeyNavigation, Keys, Shortcut, StandardKey } from "ljos-web/QtQuick";
import { make } from "../scene.js";

const names = [
  "root",
  "first",
  "second",
  "third",
  "nested",
  "scope",
  "inScopeA",
  "inScopeB",
  "scope2",
  "s2a",
  "s2b",
  "s2c",
  "s2d",
  "s2e",
  "s2f",
  "fwd",
  "fwdTarget",
  "after",
  "muted",
  "opener",
  "letter",
];
export const objects = { log: [] };

export default function KeysScene() {
  for (const name of names) objects[name] = $object();
  const { log, root, first, second, third, nested, scope, inScopeA, inScopeB, scope2 } = objects;
  const { s2a, s2b, s2c, s2d, s2e, s2f, fwd, fwdTarget, after, muted, opener, letter } = objects;
  const stop = (self, more) => ({ $self: self, activeFocusOnTab: true, width: 10, height: 10, ...more });
  return make(
    Item,
    {
      $self: root,
      width: 400,
      height: 300,
      Keys$onPressed: (event) => log.push(`root pressed ${event.key}`),
      $attach: [Keys],
    },
    () => [
      make(Item, {
        $self: first,
        focus: true,
        onFocusChanged: () => log.push(`first focus ${first.focus}`),
        onActiveFocusChanged: () => log.push(`first active ${first.activeFocus}`),
      }),
      make(Item, {
        $self: second,
        focus: true,
        onFocusChanged: () => log.push(`second focus ${second.focus}`),
        onActiveFocusChanged: () => log.push(`second active ${second.activeFocus}`),
        Keys$onPressed: (event) =>
          log.push(
            `second pressed key=${event.key} text='${event.text}' mod=${event.modifiers} rep=${event.isAutoRepeat} acc=${event.accepted}`,
          ),
        Keys$onReleased: (event) => log.push(`second released key=${event.key} acc=${event.accepted}`),
        Keys$onReturnPressed: (event) => log.push(`second return acc=${event.accepted}`),
        Keys$onLeftPressed: (event) => {
          log.push("second left");
          event.accepted = false;
        },
        Keys$onDigit1Pressed: (event) => log.push("second digit1"),
        Keys$onSpacePressed: (event) => log.push("second space"),
        Keys$onTabPressed: (event) => {
          log.push("second tab");
          event.accepted = false;
        },
        $attach: [Keys],
      }),
      make(
        Item,
        {
          $self: third,
          focus: true,
          Keys$onPressed: (event) => log.push(`third pressed ${event.key}`),
          $attach: [Keys],
        },
        () => [
          make(Item, {
            $self: nested,
            focus: true,
            Keys$onPressed: (event) => {
              log.push(`nested pressed ${event.key}`);
              // Qt.Key_C
              if (event.key === 0x43) event.accepted = true;
            },
            $attach: [Keys],
          }),
        ],
      ),
      make(
        FocusScope,
        {
          $self: scope,
          onFocusChanged: () => log.push(`scope focus ${scope.focus}`),
          onActiveFocusChanged: () => log.push(`scope active ${scope.activeFocus}`),
          Keys$onPressed: (event) => log.push(`scope pressed ${event.key}`),
          $attach: [Keys],
        },
        () => [
          make(Item, {
            $self: inScopeA,
            focus: true,
            onActiveFocusChanged: () => log.push(`inScopeA active ${inScopeA.activeFocus}`),
            onFocusChanged: () => log.push(`inScopeA focus ${inScopeA.focus}`),
            Keys$onPressed: (event) => log.push(`inScopeA pressed ${event.key}`),
            KeyNavigation$right: inScopeB,
            KeyNavigation$tab: inScopeB,
            $attach: [Keys, KeyNavigation],
          }),
          make(Item, {
            $self: inScopeB,
            onFocusChanged: () => log.push(`inScopeB focus ${inScopeB.focus}`),
            onActiveFocusChanged: () => log.push(`inScopeB active ${inScopeB.activeFocus}`),
            Keys$onPressed: (event) => log.push(`inScopeB pressed ${event.key}`),
            $attach: [Keys],
          }),
        ],
      ),
      make(FocusScope, { $self: scope2 }, () => [
        make(Item, stop(s2a)),
        make(Item, stop(s2b, { focus: true })),
        make(Item, stop(s2c, { visible: false })),
        make(Item, stop(s2d), () => [make(Item, stop(s2e))]),
        make(Item, { $self: s2f, width: 10, height: 10 }),
      ]),
      make(Item, {
        $self: fwd,
        Keys$forwardTo: [fwdTarget],
        Keys$onPressed: (event) => log.push(`fwd pressed ${event.key}`),
        $attach: [Keys],
      }),
      make(Item, {
        $self: fwdTarget,
        Keys$onPressed: (event) => {
          log.push(`fwdTarget pressed ${event.key}`);
          // Qt.Key_B
          if (event.key === 0x42) event.accepted = true;
        },
        $attach: [Keys],
      }),
      make(Item, {
        $self: after,
        get Keys$priority() {
          return Keys.AfterItem;
        },
        Keys$onPressed: (event) => log.push("after pressed"),
        $attach: [Keys],
      }),
      make(Item, {
        $self: muted,
        Keys$enabled: false,
        Keys$onPressed: (event) => log.push("muted pressed"),
        $attach: [Keys],
      }),
      make(Shortcut, { sequence: "Ctrl+K", onActivated: () => log.push("shortcut ctrl+k") }),
      make(Shortcut, { sequences: ["Ctrl+J", "F5"], onActivated: () => log.push("shortcut j/f5") }),
      make(Shortcut, {
        $self: opener,
        get sequence() {
          return StandardKey.Open;
        },
        onActivated: () => log.push("shortcut open"),
      }),
      make(Shortcut, { $self: letter, sequence: "A", onActivated: () => log.push("shortcut A") }),
      make(Shortcut, { sequence: "Ctrl+D", onActivatedAmbiguously: () => log.push("one of two") }),
      make(Shortcut, { sequence: "Ctrl+D", onActivatedAmbiguously: () => log.push("other of two") }),
    ],
  );
}
