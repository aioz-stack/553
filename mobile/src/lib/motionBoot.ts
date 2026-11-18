// Shared by the server layout (inline head script) and lib/motion.ts. Not a client module.
export const MOTION_KEY = 'pusoy.motion';
export const QUALITY_KEY = 'pusoy.quality';

/**
 * Sets <html data-motion> and <html data-quality> before first paint so there is no flash of motion.
 * Quality: the saved Low / Medium / High, else the older auto/on/off motion choice (off → low, on → high,
 * auto → low when the device asks for reduced motion, otherwise high).
 */
export const MOTION_BOOT_SCRIPT = `(function(){try{var q=localStorage.getItem('${QUALITY_KEY}');if(q!=='low'&&q!=='medium'&&q!=='high'){var p=localStorage.getItem('${MOTION_KEY}')||'auto';q=p==='off'||(p==='auto'&&matchMedia('(prefers-reduced-motion: reduce)').matches)?'low':'high';}var d=document.documentElement;d.dataset.quality=q;d.dataset.motion=q==='low'?'reduce':'full';}catch(e){}})();`;
