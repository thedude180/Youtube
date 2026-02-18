# CreatorOS - Native App Store Guide

This guide walks you through building and submitting CreatorOS to the Apple App Store and Google Play Store using Capacitor.

---

## Prerequisites

You need these installed on your local computer (not on Replit):

- **Node.js** (v18+)
- **Git**
- For iOS: **macOS** with **Xcode 15+** and an **Apple Developer Account** ($99/year)
- For Android: **Android Studio** (free) and a **Google Play Developer Account** ($25 one-time)

---

## Step 1: Clone and Build the Web App

```bash
# Clone your Replit project to your local machine
git clone <your-replit-git-url> creatoros
cd creatoros

# Install dependencies
npm install

# Build the web app for production
npm run build
```

The built files will be in `dist/public/` which Capacitor uses as the web directory.

---

## Step 2: Initialize Native Projects

```bash
# Add iOS platform
npx cap add ios

# Add Android platform
npx cap add android

# Sync web assets to native projects
npx cap sync
```

This creates `ios/` and `android/` directories with full native projects.

---

## Step 3: Configure App Icons

The app icons are already generated in `client/public/icons/` at all required sizes (72px to 1024px). After `cap sync`, you need to copy them to the native projects:

### iOS Icons
Open `ios/App/App/Assets.xcassets/AppIcon.appiconset/` and replace the icons:
- Use `icon-1024.png` as the main App Store icon (1024x1024)
- Xcode will automatically generate all required sizes from the 1024px source

### Android Icons
Open Android Studio and use **Image Asset Studio** (right-click `res` > New > Image Asset):
- Use `icon-1024.png` as the source
- It will generate all density-specific icons (mdpi through xxxhdpi)
- Use `maskable-512.png` for the adaptive icon foreground

---

## Step 4: Configure Your App

### App ID and Name
These are already set in `capacitor.config.ts`:
- **App ID**: `com.creatoros.app` (change this to match your registered ID)
- **App Name**: `CreatorOS`

### Environment Variables
For the native app to connect to your backend, update `capacitor.config.ts`:

```typescript
server: {
  // Point to your published Replit URL
  url: 'https://your-app.replit.app',
  androidScheme: 'https',
  iosScheme: 'https',
},
```

### Deep Links (Optional)
To support deep links (e.g., `creatoros://content`):

**iOS**: Add Associated Domains in Xcode:
1. Select your target > Signing & Capabilities
2. Add "Associated Domains"
3. Add `applinks:your-app.replit.app`

**Android**: Add intent filters in `android/app/src/main/AndroidManifest.xml`:
```xml
<intent-filter android:autoVerify="true">
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="https" android:host="your-app.replit.app" />
</intent-filter>
```

---

## Step 5: Build for iOS (App Store)

```bash
# Open in Xcode
npx cap open ios
```

In Xcode:
1. Select your Team under **Signing & Capabilities**
2. Set the Bundle Identifier to match your Apple Developer account
3. Set the deployment target to iOS 16.0+
4. Select **Any iOS Device** as the build target
5. Go to **Product > Archive**
6. Once archived, click **Distribute App > App Store Connect**
7. Upload to App Store Connect

### App Store Connect Setup
1. Go to [appstoreconnect.apple.com](https://appstoreconnect.apple.com)
2. Create a new app with your Bundle ID
3. Fill in:
   - **App Name**: CreatorOS
   - **Subtitle**: Your Entire YouTube Team In A Box
   - **Category**: Productivity (Primary), Entertainment (Secondary)
   - **Privacy Policy URL**: Your privacy policy URL
   - **Description**: Use the marketing copy from the landing page
4. Add screenshots (required sizes):
   - 6.7" (iPhone 15 Pro Max): 1290 x 2796px
   - 6.5" (iPhone 14 Plus): 1284 x 2778px
   - iPad Pro 12.9": 2048 x 2732px
5. Submit for review

### App Review Tips
- Provide a demo account for reviewers
- Explain the AI features clearly in review notes
- Ensure the privacy policy covers data collection
- Test on a real device before submitting

---

## Step 6: Build for Android (Play Store)

```bash
# Open in Android Studio
npx cap open android
```

In Android Studio:
1. Go to **Build > Generate Signed Bundle / APK**
2. Choose **Android App Bundle** (AAB) - required by Play Store
3. Create or select a keystore (save this securely - you need it for every update)
4. Select **release** build variant
5. Build the AAB file

### Play Store Console Setup
1. Go to [play.google.com/console](https://play.google.com/console)
2. Create a new app
3. Fill in the store listing:
   - **App Name**: CreatorOS
   - **Short Description**: AI-powered creator management platform
   - **Full Description**: Marketing copy from landing page
   - **Category**: Productivity
4. Upload the AAB file to **Production** track
5. Add screenshots (required):
   - Phone: at least 2 screenshots, 320-3840px per side
   - 7" tablet: recommended
   - 10" tablet: recommended
6. Complete content rating questionnaire
7. Set up pricing (Free with in-app purchases)
8. Submit for review

---

## Step 7: Push Notifications (Optional)

Push notifications are already configured in the Capacitor config. To enable them:

### iOS (APNs)
1. In Apple Developer portal, create an APNs key
2. Download the .p8 file
3. Add to your server-side push notification service

### Android (FCM)
1. Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
2. Add your Android app with the package name `com.creatoros.app`
3. Download `google-services.json` to `android/app/`
4. Add the FCM server key to your backend

---

## Step 8: In-App Purchases / Subscriptions

CreatorOS uses Stripe for web payments. For native apps, you have two options:

### Option A: Use App Store / Play Store Billing (Required for Digital Goods)
Apple and Google require using their billing systems for digital content. You would need to:
1. Set up products/subscriptions in App Store Connect and Play Console
2. Use `@capacitor/in-app-purchases` or RevenueCat
3. Match your tiers: Free, YouTube ($9.99), Starter ($29.99), Pro ($79.99), Ultimate ($149.99)

### Option B: Web-Based Checkout
For physical goods or services, you can redirect users to a web checkout:
```typescript
import { openExternalUrl } from './lib/native-app';
openExternalUrl('https://your-app.replit.app/money');
```

---

## Updating the App

When you make changes to CreatorOS:

```bash
# Rebuild the web app
npm run build

# Sync changes to native projects
npx cap sync

# Open and rebuild in Xcode/Android Studio
npx cap open ios    # or android
```

For web-only changes (no native plugin changes), you can also update by changing `capacitor.config.ts` to load from your live server URL instead of bundled assets.

---

## Alternative: PWA-Only Distribution

If you want to skip the app store process, CreatorOS already works as an installable PWA:

- **Android**: Chrome shows an "Install" prompt automatically
- **iOS**: Users tap Share > Add to Home Screen in Safari
- **Windows/Mac**: Chrome shows install button in the address bar

The PWA provides:
- Offline support
- Home screen icon
- Full-screen standalone experience
- Push notifications (Android/desktop)

The advantage of PWA is instant updates without app store review. The disadvantage is less visibility in app stores.

---

## Troubleshooting

### White screen on native app
- Ensure `npm run build` completed successfully
- Run `npx cap sync` after every build
- Check that `webDir` in `capacitor.config.ts` matches your build output

### OAuth not working in native app
- Update OAuth redirect URIs to include your app's custom scheme
- For Google OAuth, add the native app's client ID
- Consider using `@capacitor/browser` for OAuth flows (already configured)

### Icons not showing
- Run `npx cap sync` to copy assets
- For iOS, regenerate icons in Xcode's Asset Catalog
- For Android, use Image Asset Studio in Android Studio

---

## Cost Summary

| Item | Cost |
|------|------|
| Apple Developer Account | $99/year |
| Google Play Developer Account | $25 one-time |
| Replit hosting | Your current plan |
| Total first year | ~$124 |
| Total subsequent years | ~$99/year |
