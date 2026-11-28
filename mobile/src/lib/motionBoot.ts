// Shared by the server layout (inline head script) and lib/motion.ts. Not a client module.
export const MOTION_KEY = 'pusoy.motion';
export const QUALITY_KEY = 'pusoy.quality';

/**
 * Sets <html data-motion> and <html data-quality> before first paint so there is no flash of motion.
 * An explicit player choice wins. Otherwise reduced motion is Low, touch/weak devices are Medium,
 * and capable desktop devices are High. This rule matches lib/motion.ts quality().
 */
export const MOTION_BOOT_SCRIPT = `(function(){try{
var q=localStorage.getItem('${QUALITY_KEY}');
if(q!=='low'&&q!=='medium'&&q!=='high'){
  var legacy=localStorage.getItem('${MOTION_KEY}');
  if(legacy==='off')q='low';
  else if(legacy==='on')q='high';
  else{
    q='high';
    try{
      if(window.matchMedia('(prefers-reduced-motion: reduce)').matches)q='low';
      else{
        var n=navigator;
        var coarse=(window.matchMedia('(pointer: coarse)').matches||n.maxTouchPoints>0);
        var memory=n.deviceMemory||8;
        var cores=n.hardwareConcurrency||8;
        if(coarse||memory<=4||cores<=4)q='medium';
      }
    }catch(e){}
  }
}
var d=document.documentElement;d.dataset.quality=q;d.dataset.motion=q==='low'?'reduce':'full';
}catch(e){}})();`;
