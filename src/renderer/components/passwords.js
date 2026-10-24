// ───────────────────────────────────────────────────────────────────
//  passwords.js — fill a saved login into the active page on demand.
//  Never automatic: only runs when the user clicks the key button or
//  picks "Fill password" from the switcher.
// ───────────────────────────────────────────────────────────────────
import { h } from "../core/dom.js"
import { toast } from "../core/bus.js"
import { ico } from "../core/icons.js"
import * as T from "../core/tabs.js"

const FILL = (u, p) => `(function(u,p){
  var pw = document.querySelector('input[type=password]:not([disabled])');
  if(!pw) return 'nofield';
  var user = document.querySelector('input[autocomplete="username"],input[type=email],input[name*=user i],input[name*=email i],input[id*=user i],input[id*=email i]');
  if(!user){ var all=[].slice.call(document.querySelectorAll('input')); var i=all.indexOf(pw);
    for(var j=i-1;j>=0;j--){ var t=(all[j].type||'text'); if(t==='text'||t==='email'){ user=all[j]; break; } } }
  var set=function(el,v){ if(!el) return; var d=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;
    d.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); };
  set(user, u); set(pw, p);
  return 'ok';
})(${JSON.stringify(u)}, ${JSON.stringify(p)})`

async function doFill (entry) {
  const t = T.getActive()
  if (!t) return
  try {
    const r = await t.wv.executeJavaScript(FILL(entry.username, entry.password), true)
    toast(r === "ok" ? `Filled ${entry.username || "login"}` : "No login field found on this page")
  } catch (e) {
    toast(`Fill failed: ${e.message}`)
  }
}

export async function fillActiveTab () {
  const t = T.getActive()
  if (!t || !/^https?:/.test(t.url)) return toast("Open a website first")
  const matches = await window.flux.vault.match(t.url)
  if (!matches.length) return toast("No saved login for this site")
  if (matches.length === 1) return doFill(matches[0])

  // small chooser
  const overlay = h("div", {
    style: { position: "fixed", inset: "0", zIndex: "700", display: "grid", placeItems: "center", background: "rgba(0,0,0,.4)" },
    onclick: (e) => { if (e.target === overlay) overlay.remove() }
  }, [
    h("div.glass.glass--card", { style: { width: "min(420px,92vw)", padding: "10px", borderRadius: "14px" } },
      matches.map((m) => h("button.side-item", { style: { width: "100%" }, onclick: () => { overlay.remove(); doFill(m) } }, [
        ico("key", 15), h("span", { text: `${m.username || "(no username)"} — ${m.host}` })
      ])))
  ])
  document.body.append(overlay)
}
