const NOTIFICATION_TAG = 'dodi-message';

export type NotificationPermissionState = 'default' | 'granted' | 'denied';

export function isNotificationSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

export async function getNotificationPermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) {
    return 'denied';
  }
  return Notification.permission as NotificationPermissionState;
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!isNotificationSupported()) {
    console.warn('Notifications not supported in this browser');
    return false;
  }

  try {
    const permission = await Notification.requestPermission();
    console.log('📬 Notification permission:', permission);
    return permission === 'granted';
  } catch (error) {
    console.error('Failed to request notification permission:', error);
    return false;
  }
}

export async function showLocalNotification(
  title: string = '💌 dodi',
  body: string = 'A new message from your partner',
  options: Partial<NotificationOptions> = {}
): Promise<boolean> {
  if (!isNotificationSupported()) {
    console.warn('Notifications not supported');
    return false;
  }

  const permission = await getNotificationPermission();
  if (permission !== 'granted') {
    console.warn('Notification permission not granted');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    
    const notificationOptions = {
      body,
      icon: '/favicon.png',
      badge: '/favicon.png',
      tag: NOTIFICATION_TAG,
      renotify: true,
      vibrate: [200, 100, 200],
      requireInteraction: false,
      silent: false,
      data: {
        url: '/',
        timestamp: Date.now()
      },
      ...options
    } as NotificationOptions;
    
    await registration.showNotification(title, notificationOptions);

    console.log('📬 Local notification shown');
    return true;
  } catch (error) {
    console.error('Failed to show notification:', error);
    
    try {
      const notification = new Notification(title, {
        body,
        icon: '/favicon.png',
        tag: NOTIFICATION_TAG,
        ...options
      });
      
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      
      return true;
    } catch (fallbackError) {
      console.error('Fallback notification also failed:', fallbackError);
      return false;
    }
  }
}

export function isAppInBackground(): boolean {
  return document.hidden || document.visibilityState === 'hidden';
}

let lastInAppAlertAt = 0;
const IN_APP_ALERT_COOLDOWN_MS = 600;

/**
 * Play a short gentle tone and vibrate when a new message arrives (app in foreground).
 * Uses Web Audio API for the tone; falls back to vibration-only if AudioContext fails.
 * Cooldown prevents double-play when both chat page and global sync handler fire.
 */
export function playInAppMessageAlert(): void {
  const now = Date.now();
  if (now - lastInAppAlertAt < IN_APP_ALERT_COOLDOWN_MS) return;
  lastInAppAlertAt = now;
  try {
    if ('vibrate' in navigator) {
      navigator.vibrate([150, 80, 150]);
    }
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, now); // C5
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.4);
  } catch (e) {
    if ('vibrate' in navigator) {
      navigator.vibrate(200);
    }
  }
}

export async function notifyNewMessage(options?: { type?: 'text' | 'image' | 'voice' | 'video' }): Promise<boolean> {
  if (!isAppInBackground()) {
    playInAppMessageAlert();
    return false;
  }

  const body =
    options?.type === 'voice'
      ? 'Voice message from your partner'
      : options?.type === 'video'
        ? 'Video message from your partner'
        : options?.type === 'image'
          ? 'Photo from your partner'
          : 'A new message from your partner';

  return showLocalNotification('💌 dodi', body);
}

export async function notifyNewMemory(): Promise<boolean> {
  if (!isAppInBackground()) {
    return false;
  }

  return showLocalNotification(
    '📸 dodi',
    'A new memory was shared with you'
  );
}

export async function notifyNewLoveLetter(): Promise<boolean> {
  if (!isAppInBackground()) {
    return false;
  }

  return showLocalNotification(
    '💝 dodi',
    'A love letter is waiting for you'
  );
}

export async function notifyDailyRitual(): Promise<boolean> {
  if (!isAppInBackground()) {
    return false;
  }

  return showLocalNotification(
    '🌸 dodi',
    'Your partner shared their daily feelings'
  );
}

export async function notifyCalendarEvent(): Promise<boolean> {
  if (!isAppInBackground()) {
    return false;
  }

  return showLocalNotification(
    '📅 dodi',
    'A new moment was added to your calendar'
  );
}

export async function notifyMessageQueued(): Promise<boolean> {
  return showLocalNotification(
    '📤 dodi',
    'Message queued for your partner'
  );
}

export async function notifyConnectionRestored(): Promise<boolean> {
  return showLocalNotification(
    '💚 dodi',
    'Connection restored - messages delivered'
  );
}
