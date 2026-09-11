import { registerPlugin } from '@capacitor/core';
const LocalNotifications = registerPlugin('LocalNotifications', {
    web: () => import('./web.js').then((m) => new m.LocalNotificationsWeb()),
});
export * from './definitions.js';
export { LocalNotifications };
//# sourceMappingURL=index.js.map