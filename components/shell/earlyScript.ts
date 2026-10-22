// A tiny script that runs before React hydrates (inline in the root layout; the
// CSP allows inline scripts, see next.config.ts). Two jobs:
//
// 1. F6: mark <html data-etq="seen"> when the first-run rules were already
//    read, so the "Before you go in" card is hidden by CSS before paint
//    (no layout shift, no popup).
// 2. F5: catch a tap on the location button ([data-locate]) that lands before
//    React is ready. It asks for the location right away and goes to
//    /near?lat&lon&acc (three decimals, about 110 m: these links get shared),
//    or leaves its state on window.__bttLocate for the button
//    to show once it mounts. Once React owns the button it sets data-ready and
//    this listener steps aside.
//
// Kept as plain ES5 in a string: it runs as-is, unbundled.
export const EARLY_SCRIPT = `(function(){
var d=document,w=window;
try{if(localStorage.getItem("btt-etiquette-seen")==="1")d.documentElement.setAttribute("data-etq","seen")}catch(e){}
function tell(s){w.__bttLocate=s;try{w.dispatchEvent(new Event("btt-locate"))}catch(e){}}
d.addEventListener("click",function(e){
var t=e.target,b=t&&t.closest?t.closest("[data-locate]"):null;
if(!b||b.hasAttribute("data-ready"))return;
e.preventDefault();e.stopPropagation();
if(w.__bttLocate&&w.__bttLocate.state==="pending")return;
if(navigator.onLine===false){tell({state:"offline"});return}
if(!navigator.geolocation){tell({state:"error",code:0});return}
tell({state:"pending"});
navigator.geolocation.getCurrentPosition(function(p){
var c=p.coords;tell({state:"done"});
w.location.assign("/near?lat="+c.latitude.toFixed(3)+"&lon="+c.longitude.toFixed(3)+"&acc="+Math.round(c.accuracy));
},function(err){tell({state:"error",code:err&&err.code||0})},{enableHighAccuracy:true,timeout:15000,maximumAge:60000});
},true);
})();`;
