// Shared by the server layout (inline head script) and lib/motion.ts. Not a client module.
export const MOTION_KEY = 'pusoy.motion';
export const QUALITY_KEY = 'pusoy.quality';
/** Level the app lowered itself to on this device after measuring dropped frames (lib/perfGuard.ts). */
export const AUTO_QUALITY_KEY = 'pusoy.quality.auto';

/**
 * Sets <html data-motion> and <html data-quality> before first paint so there is no flash of motion.
 * Quality: the level the player picked (Low / Medium / High), else High — the default on every device.
 * Only the older explicit "motion off" choice still means Low; without a choice, a lower level this
 * device measured it needs (AUTO_QUALITY_KEY) applies (same rule as lib/motion.ts quality()).
 */
export const MOTION_BOOT_SCRIPT = `(function(){try{var q=localStorage.getItem('${QUALITY_KEY}');if(q!=='low'&&q!=='medium'&&q!=='high'){var a=localStorage.getItem('${AUTO_QUALITY_KEY}');q=localStorage.getItem('${MOTION_KEY}')==='off'?'low':(a==='low'||a==='medium'?a:'high');}var d=document.documentElement;d.dataset.quality=q;d.dataset.motion=q==='low'?'reduce':'full';}catch(e){}})();`;
