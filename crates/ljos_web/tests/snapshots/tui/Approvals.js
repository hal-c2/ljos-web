import { template as _$template } from "@solidjs/web";
import { insert as _$insert } from "@solidjs/web";
import { memo as _$memo } from "@solidjs/web";
import { createComponent as _$createComponent } from "@solidjs/web";
import { setStyleProperty as _$setStyleProperty } from "@solidjs/web";
import { effect as _$effect } from "@solidjs/web";
import { setAttribute as _$setAttribute } from "@solidjs/web";
import { For as _$For } from "@solidjs/web";
var _tmpl$ = /* @__PURE__ */ _$template(`<div class=q-item data-object-name=approvals style=flex-direction:column;flex-shrink:0;align-self:center;border-width:1px;border-style:solid;border-radius:0.5ch;padding-left:1ch;padding-right:1ch><div class=q-item style=flex-direction:row><span class=q-text>Approval required</span><span class=q-text></span></div><span class=q-text>`);
var _tmpl$2 = /* @__PURE__ */ _$template(`<div class=q-item style=flex-direction:row><span class=q-text></span><span class=q-text>`);
import { $ch, $model } from "qml-solid/runtime";
import { Shell, Theme } from "qml-solid/host";
export default function Approvals(props) {
	const panel$approvals = () => Shell.state.approvals;
	var _el$ = _tmpl$();
	var _el$2 = _el$.firstChild;
	var _el$3 = _el$2.firstChild;
	var _el$4 = _el$3.nextSibling;
	var _el$5 = _el$2.nextSibling;
	_$insert(_el$4, () => {
		return "  " + panel$approvals().countText;
	});
	_$insert(_el$, _$createComponent(_$For, {
		get each() {
			return $model(panel$approvals().items);
		},
		children: ($modelData, $index) => (() => {
			var _el$6 = _tmpl$2();
			var _el$7 = _el$6.firstChild;
			var _el$8 = _el$7.nextSibling;
			_$insert(_el$7, () => {
				return $modelData.active ? "▸ " : "  ";
			});
			_$insert(_el$8, () => {
				return $modelData.label;
			});
			_$effect(() => {
				return {
					e: "approval-" + $modelData.requestId,
					t: $modelData.active ? Theme.colors.accent : Theme.colors.dim,
					a: $modelData.active ? Theme.colors.text : Theme.colors.dim
				};
			}, ({ e, t, a }, _p$) => {
				e !== _p$?.e && _$setAttribute(_el$6, "data-object-name", e);
				t !== _p$?.t && _$setStyleProperty(_el$7, "color", t);
				a !== _p$?.a && _$setStyleProperty(_el$8, "color", a);
			});
			return _el$6;
		})()
	}), _el$5);
	_$insert(_el$5, () => {
		return panel$approvals().hint;
	});
	_$effect(() => {
		return {
			e: panel$approvals().count > 0 ? void 0 : "none",
			t: $ch(Shell.state.timeline.width),
			a: Theme.colors.error,
			o: Theme.colors.error,
			i: panel$approvals().countText !== "" ? void 0 : "none",
			n: Theme.colors.dim,
			s: Theme.colors.dim
		};
	}, ({ e, t, a, o, i, n, s }, _p$) => {
		e !== _p$?.e && _$setStyleProperty(_el$, "display", e);
		t !== _p$?.t && _$setStyleProperty(_el$, "width", t);
		a !== _p$?.a && _$setStyleProperty(_el$, "border-color", a);
		o !== _p$?.o && _$setStyleProperty(_el$3, "color", o);
		i !== _p$?.i && _$setStyleProperty(_el$4, "display", i);
		n !== _p$?.n && _$setStyleProperty(_el$4, "color", n);
		s !== _p$?.s && _$setStyleProperty(_el$5, "color", s);
	});
	return _el$;
}
