import { template as _$template } from "@solidjs/web";
import { insert as _$insert } from "@solidjs/web";
import { memo as _$memo } from "@solidjs/web";
import { createComponent as _$createComponent } from "@solidjs/web";
import { setStyleProperty as _$setStyleProperty } from "@solidjs/web";
import { effect as _$effect } from "@solidjs/web";
import { delegateEvents as _$delegateEvents } from "@solidjs/web";
import { For as _$For } from "@solidjs/web";
var _tmpl$ = /* @__PURE__ */ _$template(`<div class=q-item data-object-name=selectOverlay style=border-width:1px;border-style:solid;border-radius:0.5ch;flex-direction:column;flex-shrink:0;padding-left:1ch;padding-right:1ch><span class=q-text><span></span><span>↑/↓ or click · Enter apply · Esc cancel</span></span><span class=q-text data-object-name=selectStatus>`);
var _tmpl$2 = /* @__PURE__ */ _$template(`<div class=q-item style=flex-direction:column;flex-shrink:0><span class=q-text style=height:1lh;white-space:pre></span><span class=q-text style=height:1lh;white-space:pre>`);
import { $model } from "qml-solid/runtime";
import { Shell, Theme } from "qml-solid/host";
export default function SelectOverlay(props) {
	const overlay$model = () => Shell.state.select;
	var _el$ = _tmpl$();
	var _el$2 = _el$.firstChild;
	var _el$3 = _el$2.firstChild;
	var _el$4 = _el$3.nextSibling;
	var _el$5 = _el$2.nextSibling;
	_$insert(_el$3, () => {
		return overlay$model().title + " ▸ ";
	});
	_$insert(_el$5, (() => {
		var _c$ = _$memo(() => {
			return overlay$model().status === "loading";
		});
		return () => {
			return _c$() ? "loading…" : overlay$model().status === "error" ? "failed to load" : "nothing to choose";
		};
	})());
	_$insert(_el$, _$createComponent(_$For, {
		get each() {
			return $model(overlay$model().rows);
		},
		children: ($modelData, $index) => (() => {
			var _el$6 = _tmpl$2();
			var _el$7 = _el$6.firstChild;
			var _el$8 = _el$7.nextSibling;
			_el$6._$$mousedown = () => Shell.dispatch("select.choose", { index: $modelData.index });
			_$insert(_el$7, () => {
				return $modelData.name;
			});
			_$insert(_el$8, (() => {
				var _c$2 = _$memo(() => {
					return $modelData.description !== null;
				});
				return () => {
					return _c$2() ? $modelData.description : "";
				};
			})());
			_$effect(() => {
				return {
					e: $modelData.active ? Theme.colors.selectedBg : Theme.colors.bg,
					t: $modelData.description !== null ? void 0 : "none"
				};
			}, ({ e, t }, _p$) => {
				e !== _p$?.e && _$setStyleProperty(_el$6, "background-color", e);
				t !== _p$?.t && _$setStyleProperty(_el$8, "display", t);
			});
			return _el$6;
		})()
	}), null);
	_$effect(() => {
		return {
			e: overlay$model().open ? void 0 : "none",
			t: Theme.colors.accent,
			a: Theme.colors.bg,
			o: Theme.colors.accent,
			i: Theme.colors.dim,
			n: overlay$model().rows.length === 0 ? void 0 : "none",
			s: overlay$model().status === "error" ? Theme.colors.error : Theme.colors.dim
		};
	}, ({ e, t, a, o, i, n, s }, _p$) => {
		e !== _p$?.e && _$setStyleProperty(_el$, "display", e);
		t !== _p$?.t && _$setStyleProperty(_el$, "border-color", t);
		a !== _p$?.a && _$setStyleProperty(_el$, "background-color", a);
		o !== _p$?.o && _$setStyleProperty(_el$3, "color", o);
		i !== _p$?.i && _$setStyleProperty(_el$4, "color", i);
		n !== _p$?.n && _$setStyleProperty(_el$5, "display", n);
		s !== _p$?.s && _$setStyleProperty(_el$5, "color", s);
	});
	return _el$;
}
_$delegateEvents(["mousedown"]);
