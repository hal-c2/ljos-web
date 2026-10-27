import { template as _$template } from "@solidjs/web";
import { insert as _$insert } from "@solidjs/web";
import { memo as _$memo } from "@solidjs/web";
import { setStyleProperty as _$setStyleProperty } from "@solidjs/web";
import { effect as _$effect } from "@solidjs/web";
var _tmpl$ = /* @__PURE__ */ _$template(`<span class=q-text data-object-name=workingIndicator style=margin-bottom:1lh>`);
import { createMemo } from "solid-js";
import { Shell } from "qml-solid/host";
export default function WorkingIndicator(props) {
	const root$working = createMemo(() => Shell.state.timeline ? Shell.state.timeline.working : null, { "lazy": true });
	var _el$ = _tmpl$();
	_$insert(_el$, (() => {
		var _c$ = _$memo(() => {
			return !!root$working();
		});
		return () => {
			return _c$() ? root$working().text : "";
		};
	})());
	_$effect(() => root$working() !== null ? void 0 : "none", (_v$) => {
		_$setStyleProperty(_el$, "display", _v$);
	});
	return _el$;
}
