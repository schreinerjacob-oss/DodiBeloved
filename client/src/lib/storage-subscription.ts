import { initDB } from './storage';
import type { Subscription } from '@shared/schema';

export async function saveSubscription(subscription: Subscription): Promise<void> {
  const db = await initDB();
  // IndexedDB doesn't have a subscriptions store yet, so we save to settings
  await db.put('settings', {
    key: 'subscription',
    value: JSON.stringify(subscription),
  });
}

export async function getSubscription(): Promise<Subscription | null> {
  const db = await initDB();
  try {
    const stored = await db.get('settings', 'subscription');
    return stored ? JSON.parse(stored.value) : null;
  } catch {
    return null;
  }
}

export async function getTrialStatus(): Promise<{ isActive: boolean; daysRemaining: number }> {
  const subscription = await getSubscription();
  if (!subscription?.trialEndsAt) {
    return { isActive: true, daysRemaining: 30 };
  }

  const now = new Date();
  const trialEnd = new Date(subscription.trialEndsAt);
  const daysRemaining = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  return {
    isActive: daysRemaining > 0,
    daysRemaining: Math.max(0, daysRemaining),
  };
}
