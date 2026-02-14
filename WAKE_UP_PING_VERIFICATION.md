# Wake-up Ping System Verification

## Overview
Wake-up pings allow Device A (sender, offline from P2P) to signal Device B (receiver) via the PeerJS relay so B reconnects and receives queued messages. Requires toggle ON in Settings.

## 1. Toggle in Settings

**Location:** Settings → Wake-up Pings switch

**Storage:** `allowWakeUp` in IndexedDB (`settings` store), key `allowWakeUp`, value `'true'` or `'false'`.

**Default:** OFF (`false`). Loaded in `DodiContext` via `getSetting('allowWakeUp')`; only set to true when `storedAllowWakeUp === 'true'`.

**Key code:**
```ts
// client/src/contexts/DodiContext.tsx
const [allowWakeUp, setAllowWakeUpState] = useState(false);
// ...
if (storedAllowWakeUp === 'true') setAllowWakeUpState(true);
// ...
const setAllowWakeUp = async (enabled: boolean) => {
  setAllowWakeUpState(enabled);
  await saveSetting('allowWakeUp', enabled ? 'true' : 'false');
};
```

```tsx
// client/src/pages/settings.tsx
<Switch checked={allowWakeUp} onCheckedChange={setAllowWakeUp} data-testid="switch-wake-up-ping" />
```

## 2. sendWakeUpPing – metadata and conditions

**Conditions:** Called only when `globalAllowWakeUp` is true AND:
- From `sendP2PMessage`: when offline (`!globalConn || !globalConn.open`), message queued, `globalPartnerId` present
- From `send()` callback: when offline and `allowWakeUp`
- From useEffect: when `pendingCount > 0`, disconnected, `allowWakeUp`, queue for current partner

**Metadata:** `{ type: 'wake-up', senderId: globalPeer.id }` (PeerJS `metadata` option)

**Key code:**
```ts
// client/src/hooks/use-peer-connection.ts
function sendWakeUpPing(partnerId: string) {
  if (!globalPeer || globalPeer.destroyed || globalPeer.disconnected) return;
  console.log('Wake-up ping sent');
  const conn = globalPeer.connect(partnerId, {
    reliable: false,
    label: 'wake-up-ping',
    metadata: { type: 'wake-up', senderId: globalPeer.id }
  });
  // ... close after open or timeout
}
```

## 3. Receiver handling

**Flow:** Peer receives incoming connection → checks `conn.metadata?.type === 'wake-up'` → validates `conn.peer === expectedPartner` → triggers reconnect → closes ping connection.

**Key code:**
```ts
// client/src/hooks/use-peer-connection.ts (handleConnection)
if (conn.metadata?.type === 'wake-up') {
  if (conn.peer !== expectedPartner) {
    console.warn('🚫 Ignoring wake-up ping from unknown peer:', conn.peer);
    conn.close();
    return;
  }
  console.log('Wake-up ping received – reconnecting');
  if (!globalConn || !globalConn.open) {
    connectToPartner(conn.peer);  // Triggers reconnect
  } else {
    globalConn.send({ type: 'ping', timestamp: Date.now() });  // Refresh health
  }
  conn.close();  // Close ping connection
  return;
}
```

## 4. Logs

- **Sender:** `Wake-up ping sent` when initiating ping
- **Receiver:** `Wake-up ping received – reconnecting` when handling wake-up

## 5. Service worker and push

- Push registration happens in `App.tsx` when `pairingStatus === 'connected'` and `getNotifyServerUrl()` exists.
- SW handles `push` and `notificationclick` and posts `{ type: 'background-reconnect' }` to clients.
- `background-sync.ts` listens and invokes reconnect callback.
- Push is optional (requires `VITE_NOTIFY_SERVER_URL` and `VITE_VAPID_PUBLIC_KEY`).

## 6. Test flow: offline send → wake-up → reconnect → sync

1. **Device A (sender):** Enable Wake-up Pings in Settings. Go offline from P2P (e.g. close/reopen tab or disconnect network briefly) or ensure partner is disconnected.
2. **Device B (receiver):** App open, paired, Wake-up Pings ON. Disconnect from P2P (or ensure A is disconnected).
3. **Device A:** Send a message. Message is queued; wake-up ping is sent.
4. **Expected logs on A:**
   ```
   Wake-up ping sent
   📡 Sending wake-up ping to partner via relay: <partnerId>
   ```
5. **Expected logs on B:**
   ```
   Wake-up ping received – reconnecting
   🌱 Reconnected direct after ping
   ```
6. After reconnect, queued messages are flushed and sync runs.

## Summary
- Toggle: stored as `allowWakeUp`, default OFF
- sendWakeUpPing: sends `metadata: { type: 'wake-up', senderId }` when offline and toggle ON
- Receiver: handles wake-up, triggers reconnect, closes ping connection
- Push: optional; registered when paired if notify server URL is set
