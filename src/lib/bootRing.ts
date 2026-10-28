// 開場那道行星環的載入進度（__root.tsx 的 #boot、index.css 的 .boot-arc／.boot-pen）。
//
// 進度只用 transform 畫，動畫才會交給合成器：載入的那一兩秒主執行緒一直被打斷（第一次排版、模組初始化、
// React 接手），用 stroke-dashoffset 或 offset-distance 的話，每卡一下線與筆尖就停住再跳（這兩個屬性 Chromium
// 不會交給合成器，trace 的 Animation 事件寫著 compositeFailed）。
//
//   - 畫到的那段：整條橢圓都畫好，還沒畫到的用跟夜色同色的半平面遮片蓋住，遮片跟著進度轉。
//     前半圈的遮片蓋 [θ, 180°]、後半圈的蓋 [max(θ, 180°), 360°]。
//     不是把線放進旋轉的圖層再反轉回來：合成器旋轉圖層時會重新取樣，1px 的線會糊（實測過）
//   - 遮片的透明度在跨過 180°（前半圈用完）與畫滿時切掉，接縫兩端那兩小塊也是
//   - 筆尖：沿橢圓取點，寫成 translate 的關鍵影格
//
// θ 是橢圓的參數角，由弧長的比例 p 反查（跟原本 pathLength = 1 的 dash 一樣照弧長走），所以兩種寫法
// 在同一個 p 畫到同一個地方。這段要在 paint 之前跑、還沒有任何模組，只能是 head 裡的字串（BOOT_SCRIPT）。

declare global {
  interface Window {
    /** 把開場環推到進度 p（0–1，照弧長）；不帶參數是把現在的進度擺上去（#boot 剛解析完時） */
    __bootP?: (p?: number) => void;
  }
}

/** 環的傾角：從上方 24° 往下看（ry = rx · sin 24°），跟 lib/saturnSpec 的 TILT 一樣 */
export const BOOT_RING_FLAT = 0.408;
/** 筆尖走的那圈（A 環）的半徑，跟 __root.tsx 的 BOOT_RINGS 第二圈一樣 */
const BOOT_PEN_R = 23.85;

/**
 * head 裡那段開場腳本。除了掛 data-boot，還定義 window.__bootP，並照載入的階段推進度
 * （腳本開始 0.12、DOMContentLoaded 0.45、字型 0.65、load 0.85；轉場接手後推到 1）。
 * 不演的：後台、要求減少動態、自動化瀏覽器。同一個分頁重新整理時是 quick。6 秒後一定拿掉
 */
export const BOOT_SCRIPT = `(function(){try{
var d=document.documentElement;
if(navigator.webdriver||/^\\/admin(\\/|$)/.test(location.pathname)||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
var q=sessionStorage.getItem('koim-boot');sessionStorage.setItem('koim-boot','1');d.setAttribute('data-boot',q?'quick':'');
var S=${BOOT_RING_FLAT},R=${BOOT_PEN_R},N=720,L=[0],k,a;
for(k=1;k<=N;k++){a=2*Math.PI*(k-0.5)/N;L[k]=L[k-1]+Math.sqrt(Math.sin(a)*Math.sin(a)+S*S*Math.cos(a)*Math.cos(a));}
var ang=function(p){if(p<0)p+=1;var t=Math.min(1,Math.max(0,p))*L[N],lo=0,hi=N,m;while(hi-lo>1){m=(lo+hi)>>1;if(L[m]<=t)lo=m;else hi=m;}return (lo+(t-L[lo])/(L[hi]-L[lo]))*360/N;};
var LAG=[0,0.02,0.04,0.06],cur=0.12,run=null,els=null;
var parts=function(p,lo){var t=ang(p),h=p<0.5||(p===0.5&&lo)?1:0,e=p<1?1:0,o=[{transform:'rotate('+Math.min(t,180)+'deg)',opacity:h},{transform:'rotate('+Math.max(t,180)+'deg)',opacity:e},{opacity:h},{opacity:e}];
LAG.forEach(function(l){var u=ang(p-l)*Math.PI/180;o.push({transform:'translate('+(R*Math.cos(u)-1.5)+'px,'+(R*S*Math.sin(u)-1.5)+'px)'});});return o;};
var now=function(){if(!run)return cur;var g=run.a[0].effect.getComputedTiming().progress;return run.f+(run.t-run.f)*(g==null?1:g);};
var go=function(to,ms){var from=now(),ps=[],i;if(to===from)ms=0;
if(ms){for(i=0;i<=24;i++)ps.push(from+(to-from)*i/24);if((from-0.5)*(to-0.5)<0)ps.push(0.5,0.5);ps.sort(function(x,y){return (x-y)*(to-from);});}else ps=[to,to];
var frames=ps.map(function(p,i){return parts(p,p===0.5&&ms?(i>0&&ps[i-1]===0.5?to<0.5:from<0.5):false);}),t=document.timeline.currentTime;
var anims=els.map(function(el,j){return el.animate(frames.map(function(fr,i){var k={offset:ms?Math.min(1,Math.max(0,(ps[i]-from)/(to-from))):i},x;for(x in fr[j])k[x]=fr[j][x];return k;}),{duration:ms,easing:'cubic-bezier(0.22, 1, 0.36, 1)',fill:'forwards'});});
if(t!=null)anims.forEach(function(x){x.startTime=t;});if(run)run.a.forEach(function(x){x.cancel();});run={f:from,t:to,a:anims};cur=to;};
window.__bootP=function(p){if(!d.hasAttribute('data-boot'))return;
if(!els){var b=d.querySelector('#boot');if(!b)return void(p!=null&&(cur=p));
els=['.is-front .boot-arc-cover','.is-back .boot-arc-cover','.is-front .boot-arc-seam','.is-back .boot-arc-seam'].map(function(s){return b.querySelector(s);}).concat([].slice.call(b.querySelectorAll('.boot-pen i')));
if(els.some(function(e){return !e;})||!els[0].animate){els=null;return;}go(cur,0);}
if(p!=null)go(p,400);};
window.__bootP.angle=ang;
var set=function(v){window.__bootP(v);};
set(0.12);document.addEventListener('DOMContentLoaded',function(){set(0.45);});if(document.fonts)document.fonts.ready.then(function(){set(0.65);});addEventListener('load',function(){set(0.85);});
setTimeout(function(){d.removeAttribute('data-boot');},6000);
}catch(e){}})()`;

/** #boot 剛解析完就跑：把現在的進度擺上去，第一次繪製時環與筆尖已經在 0.12 的位置 */
export const BOOT_MOUNT_SCRIPT = 'window.__bootP&&window.__bootP()';
