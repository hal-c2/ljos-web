import { template as _$template } from "@solidjs/web";
import { insert as _$insert } from "@solidjs/web";
import { memo as _$memo } from "@solidjs/web";
import { createComponent as _$createComponent } from "@solidjs/web";
import { setStyleProperty as _$setStyleProperty } from "@solidjs/web";
import { effect as _$effect } from "@solidjs/web";
import { setAttribute as _$setAttribute } from "@solidjs/web";
import { delegateEvents as _$delegateEvents } from "@solidjs/web";
import { For as _$For } from "@solidjs/web";
var _tmpl$ = /* @__PURE__ */ _$template(`<div class=q-item data-object-name=notifications style=flex-direction:column;flex-shrink:0>`);
var _tmpl$2 = /* @__PURE__ */ _$template(`<div class=q-item style=flex-direction:row;height:1lh><span class=q-text></span><span class=q-text style=flex-grow:1;flex-shrink:1></span><span class=q-text> ×`);
var _tmpl$3 = /* @__PURE__ */ _$template(`<span class=q-text>`);
import { createMemo } from "solid-js";
import { $model } from "qml-solid/runtime";
import { Shell, Theme } from "qml-solid/host";
export default function Notifications(props) {
	const stack$items = createMemo(() => Shell.state.notifications ? Shell.state.notifications.items : [], { "lazy": true });
	var _el$ = _tmpl$();
	_$insert(_el$, _$createComponent(_$For, {
		get each() {
			return $model(stack$items());
		},
		children: ($modelData, $index) => {
			const card$note = () => $modelData;
			var _el$2 = _tmpl$2();
			var _el$3 = _el$2.firstChild;
			var _el$4 = _el$3.nextSibling;
			var _el$5 = _el$4.nextSibling;
			_$insert(_el$3, (() => {
				var _c$ = _$memo(() => {
					return card$note().type === "error";
				});
				return () => {
					return _c$() ? "✗ " : card$note().type === "success" ? "✓ " : "⚠ ";
				};
			})());
			_$insert(_el$4, () => {
				return card$note().title + (card$note().description ? " · " + card$note().description : "");
			});
			_$insert(_el$2, _$createComponent(_$For, {
				get each() {
					return $model(card$note().actions);
				},
				children: ($modelData, $index) => (() => {
					var _el$6 = _tmpl$3();
					_el$6._$$mousedown = () => Shell.dispatch("notification.action", {
						id: card$note().id,
						actionId: $modelData.id
					});
					_$insert(_el$6, () => {
						return " [" + $modelData.label + "]";
					});
					_$effect(() => {
						return {
							e: "notificationAction-" + card$note().id + "-" + $modelData.id,
							t: Theme.colors.accent
						};
					}, ({ e, t }, _p$) => {
						e !== _p$?.e && _$setAttribute(_el$6, "data-object-name", e);
						t !== _p$?.t && _$setStyleProperty(_el$6, "color", t);
					});
					return _el$6;
				})()
			}), _el$5);
			_el$5._$$mousedown = () => Shell.dispatch("notification.dismiss", { id: card$note().id });
			_$effect(() => {
				return {
					e: "notification-" + card$note().id,
					t: card$note().type === "error" ? Theme.colors.error : card$note().type === "success" ? Theme.colors.success : Theme.colors.warning,
					a: Theme.colors.text,
					o: "notificationDismiss-" + card$note().id,
					i: Theme.colors.dim
				};
			}, ({ e, t, a, o, i }, _p$) => {
				e !== _p$?.e && _$setAttribute(_el$2, "data-object-name", e);
				t !== _p$?.t && _$setStyleProperty(_el$3, "color", t);
				a !== _p$?.a && _$setStyleProperty(_el$4, "color", a);
				o !== _p$?.o && _$setAttribute(_el$5, "data-object-name", o);
				i !== _p$?.i && _$setStyleProperty(_el$5, "color", i);
			});
			return _el$2;
		}
	}));
	_$effect(() => stack$items().length > 0 ? void 0 : "none", (_v$) => {
		_$setStyleProperty(_el$, "display", _v$);
	});
	return _el$;
}
_$delegateEvents(["mousedown"]);
