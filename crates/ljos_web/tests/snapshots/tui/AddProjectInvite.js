import { template as _$template } from "@solidjs/web";
import { setStyleProperty as _$setStyleProperty } from "@solidjs/web";
import { effect as _$effect } from "@solidjs/web";
import { delegateEvents as _$delegateEvents } from "@solidjs/web";
var _tmpl$ = /* @__PURE__ */ _$template(`<div class=q-item data-object-name=addProjectInvite style=flex-direction:column;padding-left:1ch;padding-right:1ch;padding-top:1lh;padding-bottom:1lh><span class=q-text data-object-name=addProjectInviteTitle style=font-weight:bold>What should we work on?</span><span class=q-text>Add a project to start your first thread.</span><span class=q-text data-object-name=addProjectInviteAction>[ Add project ]`);
import { Shell, Theme } from "qml-solid/host";
export default function AddProjectInvite(props) {
	var _el$ = _tmpl$();
	var _el$2 = _el$.firstChild;
	var _el$3 = _el$2.nextSibling;
	var _el$4 = _el$3.nextSibling;
	_el$4._$$mousedown = () => Shell.dispatch("project.add");
	_$effect(() => {
		return {
			e: Theme.colors.text,
			t: Theme.colors.dim,
			a: Theme.colors.accent
		};
	}, ({ e, t, a }, _p$) => {
		e !== _p$?.e && _$setStyleProperty(_el$2, "color", e);
		t !== _p$?.t && _$setStyleProperty(_el$3, "color", t);
		a !== _p$?.a && _$setStyleProperty(_el$4, "color", a);
	});
	return _el$;
}
_$delegateEvents(["mousedown"]);
