import { template as _$template } from "@solidjs/web";
import { insert as _$insert } from "@solidjs/web";
import { memo as _$memo } from "@solidjs/web";
import { createComponent as _$createComponent } from "@solidjs/web";
import { setStyleProperty as _$setStyleProperty } from "@solidjs/web";
import { effect as _$effect } from "@solidjs/web";
import { For as _$For } from "@solidjs/web";
var _tmpl$ = /* @__PURE__ */ _$template(`<div class=q-item data-object-name=pendingUserInput style=flex-direction:column;flex-shrink:0;margin-bottom:1lh><span class=q-text></span><span class=q-text></span><span class=q-text>`);
var _tmpl$2 = /* @__PURE__ */ _$template(`<span class=q-text>`);
import { $model } from "qml-solid/runtime";
import { Shell, Theme } from "qml-solid/host";
export default function PendingUserInput(props) {
	const panel$input = () => Shell.state.userInput;
	var _el$ = _tmpl$();
	var _el$2 = _el$.firstChild;
	var _el$3 = _el$2.nextSibling;
	var _el$4 = _el$3.nextSibling;
	_$insert(_el$2, () => {
		return panel$input().headerLine ?? "";
	});
	_$insert(_el$3, () => {
		return panel$input().questionLine ?? "";
	});
	_$insert(_el$, _$createComponent(_$For, {
		get each() {
			return $model(panel$input().options);
		},
		children: ($modelData, $index) => (() => {
			var _el$5 = _tmpl$2();
			_$insert(_el$5, () => {
				return $modelData.line;
			});
			return _el$5;
		})()
	}), _el$4);
	_$insert(_el$4, () => {
		return panel$input().hint ?? "";
	});
	_$effect(() => {
		return {
			e: Shell.state.composer.answering ? void 0 : "none",
			t: Theme.colors.text,
			a: Theme.colors.dim
		};
	}, ({ e, t, a }, _p$) => {
		e !== _p$?.e && _$setStyleProperty(_el$, "display", e);
		t !== _p$?.t && _$setStyleProperty(_el$3, "color", t);
		a !== _p$?.a && _$setStyleProperty(_el$4, "color", a);
	});
	return _el$;
}
