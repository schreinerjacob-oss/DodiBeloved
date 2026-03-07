/**
 * Haptic feedback: use Capacitor Haptics on native, navigator.vibrate on web.
 */

import { Capacitor } from '@capacitor/core';

export function hapticLight(): void {
  if (Capacitor.isNativePlatform()) {
    import('@capacitor/haptics').then(({ Haptics }) => Haptics.impact({ style: 'light' }).catch(() => {}));
  } else if ('vibrate' in navigator) {
    navigator.vibrate([150, 80, 150]);
  }
}

export function hapticMedium(): void {
  if (Capacitor.isNativePlatform()) {
    import('@capacitor/haptics').then(({ Haptics }) => Haptics.impact({ style: 'medium' }).catch(() => {}));
  } else if ('vibrate' in navigator) {
    navigator.vibrate([200, 100, 200]);
  }
}

/** Ring pattern (e.g. incoming call). */
export function hapticRing(): void {
  if (Capacitor.isNativePlatform()) {
    import('@capacitor/haptics').then(({ Haptics }) => Haptics.impact({ style: 'heavy' }).catch(() => {}));
  } else if ('vibrate' in navigator) {
    navigator.vibrate([500, 200, 500, 200, 500]);
  }
}

/** Cancel any ongoing vibration (web only; native has no cancel). */
export function hapticCancel(): void {
  if (!Capacitor.isNativePlatform() && 'vibrate' in navigator) {
    navigator.vibrate(0);
  }
}
