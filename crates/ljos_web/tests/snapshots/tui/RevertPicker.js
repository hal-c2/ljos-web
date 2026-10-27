import { template as _$template } from "@solidjs/web";
import { insert as _$insert } from "@solidjs/web";
import { createComponent as _$createComponent } from "@solidjs/web";
import { setStyleProperty as _$setStyleProperty } from "@solidjs/web";
import { effect as _$effect } from "@solidjs/web";
import { For as _$For } from "@solidjs/web";
var _tmpl$ = /* @__PURE__ */ _$template(`<div class=q-item data-object-name=revertPicker style=flex-direction:column;flex-shrink:0;border-width:1px;border-style:solid;border-radius:0.5ch;padding-left:1ch;padding-right:1ch><span class=q-text></span><span class=q-text></span><span class=q-text>`);
var _tmpl$2 = /* @__PURE__ */ _$template(`<span class=q-text style=height:1lh;white-space:pre>`);
import { $model } from "qml-solid/runtime";
import { Shell, Theme } from "qml-solid/host";
export default function RevertPicker(props) {
	const picker$revert = () => Shell.state.revert;
	var _el$ = _tmpl$();
	var _el$2 = _el$.firstChild;
	var _el$3 = _el$2.nextSibling;
	var _el$4 = _el$3.nextSibling;
	_$insert(_el$2, () => {
		return picker$revert().title;
	});
	_$insert(_el$, _$createComponent(_$For, {
		get each() {
			return $model(picker$revert().rows);
		},
		children: ($modelData, $index) => (() => {
			var _el$5 = _tmpl$2();
			_$insert(_el$5, () => {
				return $modelData.text;
			});
			return _el$5;
		})()
	}), _el$3);
	_$insert(_el$3, () => {
		return picker$revert().emptyText;
	});
	_$insert(_el$4, () => {
		return picker$revert().hint;
	});
	_$effect(() => {
		return {
			e: picker$revert().open ? void 0 : "none",
			t: Theme.colors.error,
			a: Theme.colors.bg,
			o: picker$revert().rows.length === 0 ? void 0 : "none",
			i: Theme.colors.faint,
			n: Theme.colors.dim
		};
	}, ({ e, t, a, o, i, n }, _p$) => {
		e !== _p$?.e && _$setStyleProperty(_el$, "display", e);
		t !== _p$?.t && _$setStyleProperty(_el$, "border-color", t);
		a !== _p$?.a && _$setStyleProperty(_el$, "background-color", a);
		o !== _p$?.o && _$setStyleProperty(_el$3, "display", o);
		i !== _p$?.i && _$setStyleProperty(_el$3, "color", i);
		n !== _p$?.n && _$setStyleProperty(_el$4, "color", n);
	});
	return _el$;
}
