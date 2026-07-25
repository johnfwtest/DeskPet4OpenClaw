// ESM shim for the 'url' CJS polyfill
// pixi-live2d-display → @pixi/utils → url@0.11.4 (CJS)
// Vite can't handle CJS named exports from url package,
// so we re-export everything from the CJS module.
import cjsUrl from "url";
const { format, parse, resolve, resolveObject, Url } = cjsUrl;
export { format, parse, resolve, resolveObject, Url };
export default cjsUrl;
