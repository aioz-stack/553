// Shared by the server layout (inline head script) and lib/motion.ts. Not a client module.
export const MOTION_KEY = 'pusoy.motion';

/** Sets <html data-motion> before first paint so there is no flash of motion. */
export const MOTION_BOOT_SCRIPT = `(function(){try{var p=localStorage.getItem('${MOTION_KEY}')||'auto';var r=p==='off'||(p==='auto'&&matchMedia('(prefers-reduced-motion: reduce)').matches);document.documentElement.dataset.motion=r?'reduce':'full';}catch(e){}})();`;
