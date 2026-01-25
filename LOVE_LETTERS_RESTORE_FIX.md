# Love Letters Restore Flow Fix

## Summary

Fixed the restore flow to properly handle love letters by:
1. **Decrypting** love letters before filtering
2. **Filtering** to only actual love letters (excluding prayers and future letters)
3. **Sending** them as `loveLetters` category (not `futureLetters`)

## Changes Made

### 1. `getBatchForRestore` - Decrypt and Filter Love Letters

**Location:** `client/src/lib/storage-encrypted.ts`

**Updated Code:**
```typescript
export async function getBatchForRestore(stores: readonly StoreName[], partnerTimestamps: Record<string, number>, batchSize: number): Promise<any[]> {
  const db = await initDBRaw();
  const batch: any[] = [];
  
  for (const storeName of stores) {
    if (batch.length >= batchSize) break;
    
    const partnerLastSynced = partnerTimestamps[storeName] || 0;
    const allItems = await db.getAll(storeName);
    
    // Special handling for loveLetters: decrypt, filter to only actual love letters, re-encrypt
    if (storeName === 'loveLetters') {
      const decrypted = await Promise.all(
        allItems.map(async (enc) => {
          try {
            const dec = await decryptLoveLetter(enc);
            // Only include true love letters (not prayers with 'gratitude' or future letters with 'unlockDate')
            if (dec && !('gratitude' in dec) && !('unlockDate' in dec)) {
              return { decrypted: dec as LoveLetter, encrypted: enc };
            }
            return null;
          } catch {
            return null;
          }
        })
      );
      
      const validLetters = decrypted.filter((item): item is { decrypted: LoveLetter; encrypted: EncryptedData } => item !== null);
      const filtered = validLetters.filter(item => {
        const itemTime = item.decrypted.createdAt instanceof Date 
          ? item.decrypted.createdAt.getTime() 
          : Number(item.decrypted.createdAt || 0);
        return itemTime > partnerLastSynced;
      });
      
      const sliceSize = Math.min(batchSize - batch.length, filtered.length);
      const itemsToSend = filtered.slice(0, sliceSize);
      itemsToSend.forEach(item => {
        // Send the encrypted form (already encrypted, just filtered)
        batch.push({ store: 'loveLetters', data: item.encrypted });
      });
    } else {
      // For other stores, use existing logic
      const filtered = allItems.filter(item => {
        const itemTime = Number(item.updatedAt ?? item.timestamp ?? 0);
        return itemTime > partnerLastSynced;
      });
      const sliceSize = Math.min(batchSize - batch.length, filtered.length);
      const itemsToSend = filtered.slice(0, sliceSize);
      itemsToSend.forEach(item => {
        batch.push({ store: storeName, data: item });
      });
    }
  }
  
  return batch;
}
```

**Key Changes:**
- Added special handling for `loveLetters` store
- Decrypts each encrypted item
- Filters to only love letters: `!('gratitude' in dec) && !('unlockDate' in dec)`
- Filters by `createdAt` timestamp vs `partnerLastSynced`
- Sends filtered encrypted items with correct `store: 'loveLetters'`

---

### 2. `getEssentials` - Decrypt, Filter, and Send Love Letters Correctly

**Location:** `client/src/lib/storage-encrypted.ts`

**Updated Code:**
```typescript
export async function getEssentials(): Promise<Record<string, any[]>> {
  const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
  const db = await initDBRaw();
  
  // 1. Last 50 chat messages
  const messages = await getMessages(50, 0);
  const encryptedMessages = await Promise.all(messages.map(m => encryptMessage(m)));

  // 2. Memories from last 30 days
  const allMemories = await db.getAll('memories');
  const recentMemories = allMemories.filter(m => Number(m.timestamp || 0) > thirtyDaysAgo);

  // 3. Love letters only (decrypt, filter, re-encrypt)
  const allLetters = await db.getAll('loveLetters');
  const decryptedLetters = await Promise.all(
    allLetters.map(async (enc) => {
      try {
        const dec = await decryptLoveLetter(enc);
        // Only include true love letters (not prayers with 'gratitude' or future letters with 'unlockDate')
        if (dec && !('gratitude' in dec) && !('unlockDate' in dec)) {
          return dec as LoveLetter;
        }
        return null;
      } catch {
        return null;
      }
    })
  );
  
  const validLoveLetters = decryptedLetters.filter((item): item is LoveLetter => item !== null);
  const recentLoveLetters = validLoveLetters.filter(letter => {
    const letterTime = letter.createdAt instanceof Date 
      ? letter.createdAt.getTime() 
      : Number(letter.createdAt || 0);
    return letterTime > thirtyDaysAgo;
  });
  
  // Re-encrypt the filtered love letters
  const encryptedLoveLetters = await Promise.all(
    recentLoveLetters.map(letter => encryptLoveLetter(letter))
  );

  // 4. Daily whispers (Rituals) from last 30 days
  const allRituals = await db.getAll('dailyRituals');
  const recentRituals = allRituals.filter(r => {
    const time = Number(r.updatedAt || r.timestamp || 0);
    return time > thirtyDaysAgo;
  });

  return {
    messages: encryptedMessages.map((m, i) => ({ ...m, id: messages[i].id, timestamp: messages[i].timestamp })),
    memories: recentMemories,
    loveLetters: encryptedLoveLetters.map((enc, i) => ({ ...enc, id: recentLoveLetters[i].id })),
    dailyRituals: recentRituals,
    reactions: await db.getAll('reactions')
  };
}
```

**Key Changes:**
- Decrypts all items from `loveLetters` store
- Filters to only actual love letters (excludes prayers and future letters)
- Filters by `createdAt` within last 30 days
- Re-encrypts filtered love letters
- Returns as `loveLetters` category (not `futureLetters`)
- Includes `id` in the encrypted payload for proper storage

---

## How It Works

### Type Distinction
- **LoveLetter**: Has `title`, `content`, `createdAt`, `isRead` - NO `gratitude`, NO `unlockDate`
- **Prayer**: Has `gratitude` or `gratitudeEntry` field
- **FutureLetter**: Has `unlockDate` field

### Filtering Logic
```typescript
// Only true love letters
!('gratitude' in dec) && !('unlockDate' in dec)
```

### Flow
1. **Restore Essentials** (via tunnel):
   - `getEssentials()` → decrypts → filters → re-encrypts → sends as `loveLetters`
   - Receiver saves via `saveIncomingItems('loveLetters', items)`

2. **Restore Batches** (via P2P):
   - `getBatchForRestore()` → decrypts → filters → sends encrypted items as `store: 'loveLetters'`
   - Receiver saves via `saveIncomingItems('loveLetters', items)`

---

## Testing Checklist

- [ ] Create love letters on Device A
- [ ] Create prayers on Device A (should NOT be sent as love letters)
- [ ] Create future letters on Device A (should NOT be sent as love letters)
- [ ] Initiate restore from Device B
- [ ] Verify only love letters appear in Device B's Heart Space
- [ ] Verify prayers appear separately (if applicable)
- [ ] Verify future letters appear separately (if applicable)
- [ ] Test restore with large number of love letters (>50)
- [ ] Test restore with love letters older than 30 days (should not be in essentials, but in batches)

---

## Files Modified

- `client/src/lib/storage-encrypted.ts`
  - `getBatchForRestore()` - Added love letters decryption/filtering
  - `getEssentials()` - Fixed to send only love letters, not all loveLetters store contents
