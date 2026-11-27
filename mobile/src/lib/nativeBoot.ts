// Shared by the server layout (inline head script) and the Splash page. Not a client module.
export const RESUME_KEY = 'pusoy.resume';

/**
 * Inside the native app, Capacitor answers every page address without a file extension
 * (e.g. /lobby/, /practice/?tier=beginner) with the ROOT index.html. That happens whenever the
 * WebView loads a page itself — Android restoring the app after closing it in the background,
 * or a reload. Before React starts, remember the address, switch the URL back to "/" (which is
 * the page that was actually served) and let the Splash page navigate there client-side.
 * Browsers are untouched.
 *
 * It also marks <html data-native="android|ios"> before first paint, so globals.css can swap
 * effects a phone WebView must repaint on every frame (animated gradients, filters, shadows,
 * backdrop blur, animations inside full-screen SVG scenes) for GPU-composited equivalents.
 */
export const NATIVE_ROUTE_BOOT_SCRIPT = `(function(){try{var c=window.Capacitor;if(!c||!c.isNativePlatform||!c.isNativePlatform())return;document.documentElement.dataset.native=(c.getPlatform&&c.getPlatform())||'native';var p=location.pathname;if(p&&p!=='/'){sessionStorage.setItem('${RESUME_KEY}',p+location.search);history.replaceState(null,'','/');}}catch(e){}})();`;
