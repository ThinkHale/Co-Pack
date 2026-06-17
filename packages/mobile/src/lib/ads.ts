import { Platform } from 'react-native';
import type { InterstitialAd as RNInterstitialAd } from 'react-native-google-mobile-ads';

// --- AdMob interstitial wiring ----------------------------------------------
// The native SDK only exists in real dev/production builds, never in JS-only
// contexts (unit tests, type-checking). Require it defensively so that importing
// this module can never throw where the native module is absent — callers just
// see ads as "unavailable" and the game falls back to the house placeholder.
type AdsModule = typeof import('react-native-google-mobile-ads');
let Ads: AdsModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Ads = require('react-native-google-mobile-ads');
} catch {
  Ads = null;
}

// AD UNIT ids — the "/" form, distinct from the APP id ("~" form) that lives in
// app.json / Info.plist. App id identifies the app to AdMob; unit id identifies
// the specific ad slot, and is what actually serves an ad.
//
// TODO: paste your real AdMob interstitial unit IDs here before shipping a
// production build. Until then, dev builds use Google's always-fill test unit
// (TestIds.INTERSTITIAL) so we can verify the whole path with zero policy risk.
const PROD_INTERSTITIAL_IOS = 'ca-app-pub-1996752680038963/0000000000'; // TODO: real iOS interstitial unit ID
const PROD_INTERSTITIAL_ANDROID = 'ca-app-pub-1996752680038963/0000000000'; // TODO: real Android interstitial unit ID

function resolveAdUnitId(): string {
  const TestIds = Ads?.TestIds;
  if (__DEV__ && TestIds) return TestIds.INTERSTITIAL;
  return Platform.OS === 'ios' ? PROD_INTERSTITIAL_IOS : PROD_INTERSTITIAL_ANDROID;
}

let interstitial: RNInterstitialAd | null = null;
let loaded = false;
let initialized = false;

export function adsAvailable(): boolean {
  return Ads != null;
}

export function isInterstitialReady(): boolean {
  return loaded;
}

// Build and load a fresh interstitial. AdMob interstitials are single-use, so we
// re-create one after every show (and after a load error).
function preload(): void {
  if (!Ads) return;
  loaded = false;
  const { AdEventType } = Ads;
  interstitial = Ads.InterstitialAd.createForAdRequest(resolveAdUnitId(), {
    requestNonPersonalizedAdsOnly: true,
  });
  const offLoaded = interstitial.addAdEventListener(AdEventType.LOADED, () => {
    loaded = true;
    offLoaded();
  });
  interstitial.addAdEventListener(AdEventType.ERROR, () => {
    loaded = false;
  });
  interstitial.load();
}

export function preloadInterstitial(): void {
  if (Ads && !loaded) preload();
}

// Initialize the SDK once at app start, then warm the first interstitial.
export async function initAds(): Promise<void> {
  if (!Ads || initialized) return;
  initialized = true;
  try {
    await Ads.default().initialize();
    preload();
  } catch {
    initialized = false; // let a later call retry
  }
}

// Show the interstitial if one is loaded. `onClosed` fires when the player
// dismisses the ad (or immediately, if no ad is available), and the next ad is
// queued. Returns true if a real ad was shown, false if it fell through.
export function showInterstitial(onClosed: () => void): boolean {
  if (!Ads || !interstitial || !loaded) {
    onClosed();
    preloadInterstitial();
    return false;
  }
  const { AdEventType } = Ads;
  const finish = () => {
    offClosed();
    offError();
    onClosed();
    preload(); // queue the next one
  };
  const offClosed = interstitial.addAdEventListener(AdEventType.CLOSED, finish);
  const offError = interstitial.addAdEventListener(AdEventType.ERROR, finish);
  interstitial.show();
  return true;
}
