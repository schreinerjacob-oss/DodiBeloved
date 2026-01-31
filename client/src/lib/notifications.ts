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

export async function notifyNewMessage(options?: { type?: 'text' | 'image' | 'voice' | 'video' }): Promise<boolean> {
  if (!isAppInBackground()) {
    console.log('📬 App in foreground, skipping notification');
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
