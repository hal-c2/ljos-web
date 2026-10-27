import { template as _$template } from "@solidjs/web";
import { insert as _$insert } from "@solidjs/web";
import { createComponent as _$createComponent } from "@solidjs/web";
import { setStyleProperty as _$setStyleProperty } from "@solidjs/web";
import { effect as _$effect } from "@solidjs/web";
import { delegateEvents as _$delegateEvents } from "@solidjs/web";
import { For as _$For } from "@solidjs/web";
var _tmpl$ = /* @__PURE__ */ _$template(`<div class=q-item data-object-name=filesPanel style=flex-direction:column;flex-grow:1;flex-shrink:1;border-width:1px;border-style:solid;border-radius:0.5ch;padding-left:1ch;padding-right:1ch><span class=q-text data-object-name=filesHeader style=flex-shrink:0;white-space:pre;overflow:hidden;text-overflow:ellipsis;white-space:pre><span></span></span><span class=q-text data-object-name=filesMessage>`);
var _tmpl$2 = /* @__PURE__ */ _$template(`<div class=q-item style=flex-shrink:0;height:1lh><span class=q-text style=white-space:pre;overflow:hidden;text-overflow:ellipsis;white-space:pre>`);
import { $model } from "qml-solid/runtime";
import { Shell, Theme } from "qml-solid/host";
export default function FilesPanel(props) {
	const panel$files = () => Shell.state.files;
	var _el$ = _tmpl$();
	var _el$2 = _el$.firstChild;
	var _el$3 = _el$2.firstChild;
	var _el$4 = _el$2.nextSibling;
	_$insert(_el$2, () => {
		return panel$files().title;
	}, _el$3);
	_$insert(_el$3, () => {
		return panel$files().hint;
	});
	_$insert(_el$4, () => {
		return panel$files().message;
	});
	_$insert(_el$, _$createComponent(_$For, {
		get each() {
			return $model(panel$files().rows);
		},
		children: ($modelData, $index) => (() => {
			var _el$5 = _tmpl$2();
			var _el$6 = _el$5.firstChild;
			_el$5._$$mousedown = () => Shell.dispatch("files.select", { path: $modelData.path });
			_$insert(_el$6, () => {
				return $modelData.line;
			});
			_$effect(() => $modelData.selected ? Theme.colors.selectedBg : Theme.colors.bg, (_v$) => {
				_$setStyleProperty(_el$5, "background-color", _v$);
			});
			return _el$5;
		})()
	}), null);
	_$effect(() => {
		return {
			e: panel$files().open && panel$files().viewer === null ? void 0 : "none",
			t: Theme.colors.accent,
			a: Theme.colors.bg,
			o: Theme.colors.accent,
			i: Theme.colors.dim,
			n: panel$files().message !== "" ? void 0 : "none",
			s: panel$files().status === "error" ? Theme.colors.error : Theme.colors.dim
		};
	}, ({ e, t, a, o, i, n, s }, _p$) => {
		e !== _p$?.e && _$setStyleProperty(_el$, "display", e);
		t !== _p$?.t && _$setStyleProperty(_el$, "border-color", t);
		a !== _p$?.a && _$setStyleProperty(_el$, "background-color", a);
		o !== _p$?.o && _$setStyleProperty(_el$2, "color", o);
		i !== _p$?.i && _$setStyleProperty(_el$3, "color", i);
		n !== _p$?.n && _$setStyleProperty(_el$4, "display", n);
		s !== _p$?.s && _$setStyleProperty(_el$4, "color", s);
	});
	return _el$;
}
_$delegateEvents(["mousedown"]);
