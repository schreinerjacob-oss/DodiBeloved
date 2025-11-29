# QR Scanning & Pairing Flow - Debug & Test Guide

## Overview of Improvements

The QR scanning system has been enhanced with:
1. **Explicit Camera Permission Requests** - Browser now asks for permission before scanner initialization
2. **Detailed Error Messages** - Specific feedback for different permission/camera issues
3. **Console Logging** - Comprehensive debug logs for tracking the flow
4. **Permission Status UI** - Shows "Requesting camera access..." while permissions are being requested
5. **Error Recovery** - Graceful fallback when permissions denied

---

## Browser Camera Permission Flow

### Step 1: User Clicks "Join with QR Code" or Scanner Needs Camera
```
User Action: Click "Join with QR Code" button
  ↓
App State: mode = "joiner-scanning"
  ↓
useEffect Triggered: Mode changed to scanning mode
  ↓
QR reader element mounted and visible
  ↓
initializeScanner() called
```

### Step 2: Explicit Permission Request
```
initializeScanner() executes:
  1. Finds #qr-reader DOM element ✓
  2. Calls requestCameraPermission() ← NEW
  3. Browser shows: "Allow camera access?" dialog
  4. User can Accept or Decline
```

### Step 3: Permission Dialog Details
```
Browser Permission Prompt:
┌────────────────────────────────────┐
│ Camera Access Request              │
│                                    │
│ http://localhost:5000 wants to:    │
│ □ Use your camera                  │
│                                    │
│ [ Deny ]  [ Allow ]                │
└────────────────────────────────────┘
```

### Step 4: Permission Granted Flow
```
User clicks "Allow":
  1. navigator.mediaDevices.getUserMedia() succeeds
  2. Console: "Camera permission granted, stream obtained: [stream-id]"
  3. Stream tracks stopped (cleanup)
  4. returnValue: true
  5. Scanner initializes with Html5QrcodeScanner
  6. Camera preview appears in #qr-reader
  7. QR scanning active ✓
```

### Step 5: Permission Denied Flow
```
User clicks "Deny":
  1. navigator.mediaDevices.getUserMedia() throws NotAllowedError
  2. Console: "Camera permission denied or error: NotAllowedError: Permission denied"
  3. Toast shown: "Camera Access Required - Please grant camera permission in your browser settings"
  4. returnValue: false
  5. Scanner initialization aborted
  6. UI remains on scanning screen, can retry or go back
```

---

## Console Logging for Debugging

### Permission Debugging
```
[Step 1] Mode activated:
console.log('QR scanning mode activated: joiner-scanning')

[Step 2] Element check:
console.log('QR reader element found, initializing scanner...')

[Step 3] Permission check starts:
console.log('Checking camera permissions...')

[Step 4] Permission request:
console.log('Requesting camera permission...')

[Step 5a] Permission granted:
console.log('Camera permission granted, stream obtained: [uuid]')

[Step 5b] Permission denied:
console.error('Camera permission denied or error: NotAllowedError: Permission denied')

[Step 6] Scanner creation:
console.log('Camera permission confirmed, creating scanner...')

[Step 7] Scanner render:
console.log('Starting scanner.render()...')

[Step 8] Scanner ready:
console.log('Scanner rendering successful')
```

### Complete Debug Transcript
```
Browser Console Output:
─────────────────────────

[User clicks "Join with QR Code"]

QR scanning mode activated: joiner-scanning
  ↓ (100ms timeout)
QR reader element found, initializing scanner...
Checking camera permissions...
Requesting camera permission...
  ↓ (Browser shows permission dialog)
Camera permission granted, stream obtained: 5d8c2f1a-9e3c-4a8b-b2c1-9f3a8e5d2c1a
Camera permission confirmed, creating scanner...
Starting scanner.render()...
Scanner rendering successful
  ↓ (Camera preview appears)
[Camera active - waiting for QR code]

[User points camera at QR code]

Joiner scanned QR data: dodi:...base64_encoded...
[QR decode and processing begins]
```

---

## Complete User Journey - QR Scanning Test

### Scenario 1: Successful Pairing (Happy Path)

#### Device A (Creator):
```
Time: 10:00 AM
─────────────────
1. Opens dodi app
2. Click: "Create Connection"
3. Screen shows unique QR code
4. Passphrase displayed: "beloved-secret-12345"
5. Waiting for partner to scan...

Console Logs:
- Create pairing error: None
- WebRTC offer created
- QR payload encoded
```

#### Device B (Joiner):
```
Time: 10:05 AM
─────────────────
1. Opens dodi app
2. Click: "Join with QR Code"
3. Console: "QR scanning mode activated: joiner-scanning"
4. Console: "QR reader element found, initializing scanner..."
5. Console: "Requesting camera permission..."
6. Browser shows: "Camera Access?" dialog
7. User clicks: "Allow"
8. Console: "Camera permission granted, stream obtained: [id]"
9. Console: "Scanner rendering successful"
10. Camera preview appears (live video feed)
11. Status shows: "Camera is ready"
12. Points camera at Device A's QR code
13. Console: "Joiner scanned QR data: dodi:..."
14. Console: "Decoded payload: {creatorId: 'usr_xyz...', sessionId: 'abc123'}"
15. Processing begins...
```

#### Connection Established:
```
Time: 10:06 AM
─────────────────
Device A Console:
- Receives Device B's answer QR
- Scans answer QR
- Console: "Creator scanned answer QR data: dodi-answer:..."
- WebRTC connection established

Device B Console:
- Waiting for partner to scan...
- Toast: "Connected! Your private sanctuary awaits."
- pairingStatus changes to "connected"
- PIN setup page appears

Both devices:
- peerState.connected = true
- onPeerConnected() called
- Show PIN setup for first time pairing
```

---

### Scenario 2: Camera Permission Denied

#### Device B (Joiner):
```
Time: 10:05 AM
─────────────────
1. Click: "Join with QR Code"
2. Console: "QR scanning mode activated: joiner-scanning"
3. Console: "Requesting camera permission..."
4. Browser shows: "Camera Access?" dialog
5. User clicks: "Deny"
6. Console: "Camera permission denied or error: NotAllowedError: Permission denied"
7. Toast shows: "Camera Access Required"
   Message: "Please grant camera permission in your browser settings"
8. Status: "Camera is ready" (greyed out)
9. User can click: "Back" to cancel

Recovery Options:
A. Click browser settings and grant permission
   - Then click "Join with QR Code" again
B. Go back and try manual pairing method
C. Ask partner to email QR code/passphrase
```

---

### Scenario 3: No Camera Device Found

#### Device B (Desktop without webcam):
```
User clicks: "Join with QR Code"
  ↓
Browser attempts: navigator.mediaDevices.getUserMedia()
  ↓
Error: NotFoundError: Requested device not found
  ↓
Console: "Camera permission denied or error: NotFoundError: Requested device not found"
  ↓
Toast shows: "Camera Error"
Message: "No camera device found on this device"
  ↓
User options:
- Use external USB webcam
- Use phone to scan instead
- Use manual pairing code method
```

---

### Scenario 4: Camera In Use by Another App

#### Device B (Camera already open in Zoom):
```
User clicks: "Join with QR Code"
  ↓
Browser attempts: navigator.mediaDevices.getUserMedia()
  ↓
Error: NotReadableError: Could not start video source
  ↓
Console: "Camera permission denied or error: NotReadableError: Could not start video source"
  ↓
Toast shows: "Camera Error"
Message: "Camera is already in use by another application"
  ↓
User options:
- Close Zoom (or other app using camera)
- Click "Back" and try again
```

---

## Testing Checklist

### ✅ Permission Request Testing
- [ ] Click "Join with QR Code" button
- [ ] Verify browser shows camera permission dialog
- [ ] Check console for: "Requesting camera permission..."
- [ ] Click "Allow" in permission dialog
- [ ] Verify console shows: "Camera permission granted"
- [ ] Camera preview appears in UI

### ✅ Permission Denied Testing
- [ ] In browser settings, deny camera permission for localhost:5000
- [ ] Clear app cache / reload page
- [ ] Click "Join with QR Code" button
- [ ] See permission dialog again
- [ ] Click "Deny"
- [ ] Verify toast: "Camera Access Required"
- [ ] Verify error message about granting permissions
- [ ] Check console for: "Camera permission denied"

### ✅ QR Scanning Testing
- [ ] Show creator QR on Device A
- [ ] Device B scans creator QR with active camera
- [ ] Verify console: "Joiner scanned QR data: dodi:..."
- [ ] Verify QR decoding succeeds
- [ ] Verify Device B shows "Now Show This to Your Partner" with answer QR
- [ ] Device A scans Device B's answer QR
- [ ] Verify both devices show connected status
- [ ] Verify PIN setup appears

### ✅ Error Recovery Testing
- [ ] Deny camera permission
- [ ] Click "Back" button
- [ ] Should return to choose screen
- [ ] Can try again or select different pairing method
- [ ] No orphaned scanner state

### ✅ Console Logging Verification
- [ ] Open browser DevTools (F12)
- [ ] Go to Console tab
- [ ] Follow the numbered log sequence above
- [ ] Verify all expected logs appear
- [ ] Check for any ERROR messages (should only be in denied scenario)

---

## Troubleshooting Guide

### Issue: Camera permission dialog never appears
**Solution:**
1. Check browser console for errors
2. Verify #qr-reader element exists in DOM
3. Clear browser cache: Settings → Privacy → Cookies and site data → Clear data
4. Try different browser (Firefox, Chrome, Safari)
5. Check if browser blocked camera access previously

### Issue: "Camera is ready" but no video preview
**Solution:**
1. Camera might not have permission (check system settings)
2. Try clicking "Back" and then "Join with QR Code" again
3. Check if another app is using camera
4. Restart browser
5. On macOS: System Preferences → Security & Privacy → Camera → Enable localhost:5000

### Issue: QR code scans but connection fails
**Solution:**
1. Check browser console for error details
2. Verify WebRTC works (check peerState logs)
3. Verify both devices are on same network
4. Make sure offer/answer payloads are correct
5. Check that partner pairing payload matches

### Issue: Scanner won't stop even after leaving scanning screen
**Solution:**
1. This is handled by cleanupScanner()
2. Check console for: "Cleaning up scanner on mode change or unmount"
3. If stuck, refresh page (F5)
4. Clear camera tracks: Settings → Privacy → Cameras → Remove localhost:5000

---

## Key Code Sections

### Camera Permission Function (New)
```typescript
const requestCameraPermission = async (): Promise<boolean> => {
  try {
    console.log('Requesting camera permission...');
    setRequestingPermission(true);
    const stream = await navigator.mediaDevices.getUserMedia({ 
      video: { facingMode: 'environment' } 
    });
    console.log('Camera permission granted, stream obtained:', stream.id);
    stream.getTracks().forEach(track => track.stop());
    setRequestingPermission(false);
    return true;
  } catch (error: unknown) {
    setRequestingPermission(false);
    // Specific error handling for different scenarios
    // ... (see pairing.tsx for full implementation)
    return false;
  }
};
```

### Scanner Initialization (Updated)
```typescript
const initializeScanner = async (isCreatorScanning: boolean) => {
  try {
    console.log('Checking camera permissions...');
    const hasPermission = await requestCameraPermission();
    if (!hasPermission) {
      console.log('Camera permission not granted, aborting scanner initialization');
      setScannerInitialized(false);
      return;
    }
    
    console.log('Camera permission confirmed, creating scanner...');
    // ... rest of scanner initialization
  } catch (error) {
    // Error handling
  }
};
```

---

## Success Indicators

✅ **QR Scanning Working Successfully When:**
1. Browser shows camera permission dialog
2. Console shows ordered sequence of debug logs
3. Camera preview appears after permission granted
4. QR codes scan successfully
5. Pairing completes in ~2-5 seconds
6. Both devices show "Connected" status
7. PIN setup appears after connection
8. No red error toasts (unless permission denied)

✅ **Camera Permissions Working When:**
1. First attempt shows dialog
2. Subsequent attempts don't show dialog (cached)
3. Revoking permission in settings shows error on next attempt
4. Error messages are specific and helpful
5. User can recover by granting permission

---

## Next Steps

1. **Test on Multiple Devices:**
   - Desktop Chrome/Firefox/Safari
   - Mobile iOS Safari
   - Mobile Android Chrome
   - Tablets

2. **Test Permission Scenarios:**
   - First-time permission request
   - Permission already granted
   - Permission previously denied
   - System-level camera restrictions

3. **Monitor Console:**
   - Watch for any unexpected errors
   - Verify logging sequence matches
   - Check for permission state transitions

4. **Performance Check:**
   - Pairing should complete <5 seconds
   - Scanner should initialize <1 second after permission
   - No memory leaks (check DevTools Memory tab)

---

## Version Info
- Updated: Today
- QR Library: html5-qrcode
- Camera API: navigator.mediaDevices.getUserMedia()
- Test Environment: http://localhost:5000
