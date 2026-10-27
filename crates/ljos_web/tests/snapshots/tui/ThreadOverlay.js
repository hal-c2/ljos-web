import { template as _$template } from "@solidjs/web";
import { insert as _$insert } from "@solidjs/web";
import { memo as _$memo } from "@solidjs/web";
import { setStyleProperty as _$setStyleProperty } from "@solidjs/web";
import { effect as _$effect } from "@solidjs/web";
var _tmpl$ = /* @__PURE__ */ _$template(`<div class=q-item data-object-name=threadOverlay style=flex-shrink:0;border-width:1px;border-style:solid;border-radius:0.5ch;flex-direction:column;padding-left:1ch;padding-right:1ch><span class=q-text data-object-name=confirmDeleteText></span><span class=q-text>y delete · n / Esc cancel`);
import { createMemo } from "solid-js";
import { Shell, Theme } from "qml-solid/host";
export default function ThreadOverlay(props) {
	const overlay$state = () => Shell.state.overlay;
	const overlay$confirming = createMemo(() => overlay$state() !== null && overlay$state().kind === "confirmDelete", { "lazy": true });
	var _el$ = _tmpl$();
	var _el$2 = _el$.firstChild;
	var _el$3 = _el$2.nextSibling;
	_$insert(_el$2, (() => {
		var _c$ = _$memo(() => {
			return !!overlay$confirming();
		});
		return () => {
			return _c$() ? overlay$state().line : "";
		};
	})());
	_$effect(() => {
		return {
			e: overlay$confirming() ? void 0 : "none",
			t: Theme.colors.error,
			a: Theme.colors.bg,
			o: Theme.colors.dim
		};
	}, ({ e, t, a, o }, _p$) => {
		e !== _p$?.e && _$setStyleProperty(_el$, "display", e);
		t !== _p$?.t && _$setStyleProperty(_el$, "border-color", t);
		a !== _p$?.a && _$setStyleProperty(_el$, "background-color", a);
		o !== _p$?.o && _$setStyleProperty(_el$3, "color", o);
	});
	return _el$;
}
