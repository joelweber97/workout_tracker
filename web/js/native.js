// The seam between the app and the phone.
//
// Phone-first means the app can lean on native capabilities instead of hedging
// each one behind a browser fallback. Everything native goes through here, and
// every function is a no-op outside the Capacitor shell — so the browser build
// still runs as a development preview, it just doesn't buzz or notify.

const shell = window.Capacitor;
export const isNative = Boolean(shell?.isNativePlatform?.());

/** Lazily imported so the browser preview never loads plugin code at all. */
const load = (specifier) => (isNative ? import(specifier) : Promise.resolve(null));

// --- Haptics ------------------------------------------------------------------
// iOS has no Vibration API in any web view, so `navigator.vibrate` has never
// done anything on an iPhone. The native plugin uses the Taptic Engine.

export const haptics = {
  /** A tick — set logged, button confirmed. */
  async tap() {
    const mod = await load('@capacitor/haptics');
    if (mod) await mod.Haptics.impact({ style: mod.ImpactStyle.Light }).catch(() => {});
    else navigator.vibrate?.(12);
  },
  /** Something worth noticing — a personal record, rest over. */
  async success() {
    const mod = await load('@capacitor/haptics');
    if (mod) await mod.Haptics.notification({ type: mod.NotificationType.Success }).catch(() => {});
    else navigator.vibrate?.([40, 60, 40, 60, 90]);
  },
};

// --- Rest-timer notification ---------------------------------------------------
// The rest countdown runs in JS and dies with the screen. A scheduled local
// notification fires at the right moment even with the phone locked in a bag.

const REST_ID = 4242;
let permissionAsked = false;

export const restNotification = {
  async schedule(secondsFromNow) {
    const mod = await load('@capacitor/local-notifications');
    if (!mod) return;
    try {
      if (!permissionAsked) {
        permissionAsked = true;
        const { display } = await mod.LocalNotifications.checkPermissions();
        if (display !== 'granted') {
          const asked = await mod.LocalNotifications.requestPermissions();
          if (asked.display !== 'granted') return;
        }
      }
      await this.cancel();
      await mod.LocalNotifications.schedule({
        notifications: [{
          id: REST_ID,
          title: 'Rest over',
          body: 'Next set.',
          schedule: { at: new Date(Date.now() + secondsFromNow * 1000) },
        }],
      });
    } catch {
      // Notifications are a nicety; the in-app timer still runs.
    }
  },

  async cancel() {
    const mod = await load('@capacitor/local-notifications');
    if (!mod) return;
    await mod.LocalNotifications.cancel({ notifications: [{ id: REST_ID }] }).catch(() => {});
  },
};
