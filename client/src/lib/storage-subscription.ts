import { initDB, getSetting } from './storage';
import type { Subscription } from '@/types';

export async function saveSubscription(subscription: Subscription): Promise<void> {
  const db = await initDB();
  // Store subscription with pairingId so BOTH users can access via the shared pairing
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

export async function checkSubscriptionAccess(): Promise<{ hasAccess: boolean; plan: string | null }> {
  // Check if THIS user has an active subscription (they paid)
  const ownSubscription = await getSubscription();
  
  // If they have an active non-trial subscription, they have access (they're the one who paid)
  if (ownSubscription?.status === 'active') {
    return { hasAccess: true, plan: ownSubscription.plan };
  }

  // Check if partner has an active subscription (only one needs to pay)
  // This would be handled via sync through WebSocket
  // For now, if no local subscription, trial is active by default
  return { hasAccess: true, plan: null };
}

export async function getTrialStatus(): Promise<{ isActive: boolean; daysRemaining: number }> {
  const subscription = await getSubscription();
  
  // If subscription is active (paid), trial is over
  if (subscription?.status === 'active') {
    return { isActive: false, daysRemaining: 0 };
  }

  // Check trial period (30 days from first use)
  if (!subscription?.trialEndsAt) {
    // First time - initialize 30 day trial
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + 30);
    
    const newSubscription: Subscription = {
      id: `sub_${Date.now()}`,
      pairingId: `${await getSetting('userId')}:${await getSetting('partnerId')}`,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      plan: 'trial',
      status: 'trial',
      trialEndsAt: trialEnd,
      renewsAt: null,
      createdAt: new Date(),
    };
    
    await saveSubscription(newSubscription);
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
