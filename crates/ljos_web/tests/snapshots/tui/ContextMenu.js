import { template as _$template } from "@solidjs/web";
import { insert as _$insert } from "@solidjs/web";
import { createComponent as _$createComponent } from "@solidjs/web";
import { setStyleProperty as _$setStyleProperty } from "@solidjs/web";
import { effect as _$effect } from "@solidjs/web";
import { delegateEvents as _$delegateEvents } from "@solidjs/web";
import { For as _$For } from "@solidjs/web";
var _tmpl$ = /* @__PURE__ */ _$template(`<div class=q-item data-object-name=contextMenuLayer style=position:absolute;left:0ch;top:0lh;z-index:100><div class=q-item data-object-name=contextMenu style=position:absolute;border-width:1px;border-style:solid;border-radius:0.5ch;flex-direction:column;padding-left:1ch;padding-right:1ch;overflow:hidden>`);
var _tmpl$2 = /* @__PURE__ */ _$template(`<div class=q-item style=height:1lh;flex-shrink:0><span class=q-text style=flex-grow:1;white-space:pre>`);
import { $ch, $lh, $model } from "qml-solid/runtime";
import { Shell, Theme } from "qml-solid/host";
export default function ContextMenu(props) {
	const layer$menu = () => Shell.state.contextMenu;
	var _el$ = _tmpl$();
	var _el$2 = _el$.firstChild;
	_el$._$$mousedown = (mouse) => {
		if (layer$menu()) Shell.dispatch("contextMenu.select", {
			requestId: layer$menu().requestId,
			id: null
		});
	};
	_el$2._$$mousedown = (mouse) => {
		mouse.accepted = true;
	};
	_$insert(_el$2, _$createComponent(_$For, {
		get each() {
			return $model(layer$menu() ? layer$menu().rows : []);
		},
		children: ($modelData, $index) => (() => {
			var _el$3 = _tmpl$2();
			var _el$4 = _el$3.firstChild;
			_el$3._$$mousedown = (mouse) => {
				mouse.accepted = true;
				if ($modelData.kind === "item" && !$modelData.disabled) Shell.dispatch("contextMenu.select", {
					requestId: layer$menu().requestId,
					id: $modelData.id
				});
			};
			_el$3._$$mousemove = () => {
				if ($modelData.kind === "item") Shell.dispatch("contextMenu.hover", { index: $modelData.index });
			};
			_$insert(_el$4, () => {
				return $modelData.text;
			});
			_$effect(() => $modelData.kind === "item" && $modelData.active ? Theme.colors.selectedBg : Theme.colors.bg, (_v$) => {
				_$setStyleProperty(_el$3, "background-color", _v$);
			});
			return _el$3;
		})()
	}));
	_$effect(() => {
		return {
			e: layer$menu() !== null ? void 0 : "none",
			t: $ch(Shell.state.size.columns),
			a: $lh(Shell.state.size.rows),
			o: layer$menu() ? $ch(layer$menu().x) : "0ch",
			i: layer$menu() ? $lh(layer$menu().y) : "0lh",
			n: layer$menu() ? $ch(layer$menu().width) : "0ch",
			s: layer$menu() ? $lh(layer$menu().height) : "0lh",
			h: Theme.colors.faint,
			r: Theme.colors.bg
		};
	}, ({ e, t, a, o, i, n, s, h, r }, _p$) => {
		e !== _p$?.e && _$setStyleProperty(_el$, "display", e);
		t !== _p$?.t && _$setStyleProperty(_el$, "width", t);
		a !== _p$?.a && _$setStyleProperty(_el$, "height", a);
		o !== _p$?.o && _$setStyleProperty(_el$2, "left", o);
		i !== _p$?.i && _$setStyleProperty(_el$2, "top", i);
		n !== _p$?.n && _$setStyleProperty(_el$2, "width", n);
		s !== _p$?.s && _$setStyleProperty(_el$2, "height", s);
		h !== _p$?.h && _$setStyleProperty(_el$2, "border-color", h);
		r !== _p$?.r && _$setStyleProperty(_el$2, "background-color", r);
	});
	return _el$;
}
_$delegateEvents(["mousedown", "mousemove"]);
