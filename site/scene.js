// Canvas projection and CSS cube geometry follow the supplied Varin reference.
// The scene is decorative: pause off-screen, in background tabs, and for reduced motion.
export const CELL = 96, TILT = 58, DISTANCE = 1800;
const RAD = Math.PI / 180;
export function projectFloor(x, y, tilt = TILT) {
  const spunX = (x - y) * Math.SQRT1_2, spunY = (x + y) * Math.SQRT1_2;
  const w = 1 - spunY * Math.sin(tilt * RAD) / DISTANCE;
  return w <= .02 ? null : { x: spunX / w, y: spunY * Math.cos(tilt * RAD) / w };
}
export function tilePulse(row, col, cycle, seed = 0x02f6e2b1) {
  let value = seed ^ 0x6d2b79f5;
  value = Math.imul(value ^ row, 0x45d9f3b);
  value = Math.imul(value ^ col, 0x119de1f3);
  value = Math.imul(value ^ cycle, 0x27d4eb2d);
  value ^= value >>> 16;
  return (value >>> 0) / 0x1_0000_0000 < .12;
}
export function buildTiles() {
  const tiles = [];
  for (let row = -14; row <= 14; row++) for (let col = -14; col <= 14; col++) {
    let hash = Math.imul(row ^ 0x02f6e2b1, 0x45d9f3b); hash = Math.imul(hash ^ col, 0x119de1f3); hash ^= hash >>> 16;
    tiles.push({ row, col, x: col * CELL, y: row * CELL, opacity: 1 - Math.hypot(row, col) / Math.hypot(14,14) * .45, delay: ((hash >>> 0) / 0x1_0000_0000) * 2200 });
  }
  return tiles;
}
export function mountScene(hero) {
  const scene = hero.querySelector('.scene'), canvas = hero.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)'), dark = matchMedia('(prefers-color-scheme: dark)');
  const tiles = buildTiles(); let width = 1, height = 1, ratio = 1, originX = 0, originY = 0, scale = .78, visible = true, raf = 0, last = 0;
  const isDark = () => document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && dark.matches);
  function paint(now = 0) {
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = isDark() ? 'rgba(255,255,255,.14)' : 'rgba(27,26,24,.15)';
    ctx.fillStyle = isDark() ? '#292929' : '#eaeae7'; ctx.lineWidth = 1;
    const screen = (x, y) => { const p = projectFloor(x,y); return p ? { x: originX + p.x*scale, y: originY+p.y*scale } : null; };
    for (const tile of tiles) {
      const a=screen(tile.x-48,tile.y-48),b=screen(tile.x+48,tile.y-48),c=screen(tile.x+48,tile.y+48),d=screen(tile.x-48,tile.y+48);
      if (!a||!b||!c||!d) continue;
      if (Math.max(a.x,b.x,c.x,d.x)<0||Math.min(a.x,b.x,c.x,d.x)>width||Math.max(a.y,b.y,c.y,d.y)<0||Math.min(a.y,b.y,c.y,d.y)>height) continue;
      const elapsed=now-tile.delay, cycle=Math.floor(elapsed/2800);
      if (!reduced.matches && elapsed>=0 && tilePulse(tile.row,tile.col,cycle)) {
        ctx.globalAlpha=tile.opacity*(1-Math.cos((elapsed%2800)/2800*Math.PI*2))/2;
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.closePath();ctx.fill();
      }
      ctx.globalAlpha=tile.opacity;ctx.beginPath();ctx.moveTo(b.x,b.y);ctx.lineTo(c.x,c.y);ctx.lineTo(d.x,d.y);ctx.stroke();
    }
    ctx.globalAlpha=1;
  }
  const canAnimate=()=>ctx && visible && !document.hidden && !reduced.matches;
  function frame(now) { raf=0; if (!canAnimate()) return; if(now-last>=32){paint(now);last=now;}raf=requestAnimationFrame(frame); }
  function syncAnimation(){ if(raf)cancelAnimationFrame(raf);raf=0;paint();if(canAnimate())raf=requestAnimationFrame(frame); }
  function measure(){ width=hero.clientWidth;height=hero.clientHeight;ratio=Math.min(devicePixelRatio||1,1.5);scale=width<=660?.58:.78;originX=width>860?width*.78:width*.5;originY=height*.6;canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));scene.style.setProperty('--origin-x',`${originX}px`);scene.style.setProperty('--origin-y',`${originY}px`);scene.style.setProperty('--mask-x',`${originX}px`);scene.style.setProperty('--mask-y',`${originY}px`);scene.style.setProperty('--scene-scale',String(scale));paint(); }
  const resize=new ResizeObserver(measure);resize.observe(hero);
  const intersection=new IntersectionObserver(([entry])=>{visible=entry.isIntersecting;syncAnimation();});intersection.observe(hero);
  const theme=new MutationObserver(()=>paint());theme.observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
  reduced.addEventListener('change',syncAnimation);dark.addEventListener('change',()=>paint());document.addEventListener('visibilitychange',syncAnimation);
  hero.addEventListener('pointermove',event=>{if(reduced.matches||event.pointerType!=='mouse')return;const rect=hero.getBoundingClientRect();const ny=(event.clientY-rect.top)/Math.max(1,rect.height)-.5;scene.style.setProperty('--tilt',`${TILT-ny*4.5}deg`);scene.style.setProperty('--lift',`${-ny*6}px`);});
  hero.addEventListener('pointerleave',()=>{scene.style.setProperty('--tilt','58deg');scene.style.setProperty('--lift','0px');});
  window.addEventListener('pagehide',()=>{if(raf)cancelAnimationFrame(raf);raf=0;});window.addEventListener('pageshow',syncAnimation);
  measure();syncAnimation();
}
