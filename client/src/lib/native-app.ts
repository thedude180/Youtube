import { Capacitor } from '@capacitor/core';

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function getPlatform(): 'ios' | 'android' | 'web' {
  return Capacitor.getPlatform() as 'ios' | 'android' | 'web';
}

export async function initNativeFeatures() {
  if (!isNativeApp()) return;

  const platform = getPlatform();

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Dark });
    if (platform === 'android') {
      await StatusBar.setBackgroundColor({ color: '#0a0a0f' });
    }
  } catch {}

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    await SplashScreen.hide();
  } catch {}

  try {
    const { App } = await import('@capacitor/app');
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      }
    });

    App.addListener('appUrlOpen', ({ url }) => {
      const path = new URL(url).pathname;
      if (path) {
        window.location.href = path;
      }
    });
  } catch {}

  try {
    const { Keyboard } = await import('@capacitor/keyboard');
    Keyboard.addListener('keyboardWillShow', () => {
      document.body.classList.add('keyboard-open');
    });
    Keyboard.addListener('keyboardWillHide', () => {
      document.body.classList.remove('keyboard-open');
    });
  } catch {}
}

export async function shareContent(title: string, text: string, url?: string) {
  if (!isNativeApp()) {
    if (navigator.share) {
      return navigator.share({ title, text, url });
    }
    return;
  }

  try {
    const { Share } = await import('@capacitor/share');
    await Share.share({ title, text, url, dialogTitle: 'Share from CreatorOS' });
  } catch {}
}

export async function triggerHaptic(type: 'light' | 'medium' | 'heavy' = 'light') {
  if (!isNativeApp()) return;

  try {
    const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
    const style = type === 'light' ? ImpactStyle.Light : type === 'medium' ? ImpactStyle.Medium : ImpactStyle.Heavy;
    await Haptics.impact({ style });
  } catch {}
}

export async function openExternalUrl(url: string) {
  if (!isNativeApp()) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  try {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } catch {}
}
