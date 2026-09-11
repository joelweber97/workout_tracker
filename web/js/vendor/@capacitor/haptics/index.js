import { registerPlugin } from '@capacitor/core';
const Haptics = registerPlugin('Haptics', {
    web: () => import('./web.js').then((m) => new m.HapticsWeb()),
});
export * from './definitions.js';
export { Haptics };
//# sourceMappingURL=index.js.map