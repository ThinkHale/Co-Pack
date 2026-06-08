// Feedback layer. The web build synthesizes WebAudio blips; React Native has no
// WebAudio, so on device we map the same event "sounds" to haptic taps via
// expo-haptics. Same SoundKind API + soundOn gate as the web `sound.ts`, so the
// store and UI are unchanged. (Audio SFX files can be layered in later with
// expo-audio without touching callers.)
import * as Haptics from 'expo-haptics';

export type SoundKind = 'cash' | 'win' | 'hire' | 'bad' | 'alert' | 'over' | 'click';

// Kept for API parity with the web (which resumes its AudioContext here).
export function unlockAudio(): void {
  // No-op on native; haptics need no gesture unlock.
}

const fire: Record<SoundKind, () => Promise<void>> = {
  cash: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  win: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  hire: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  bad: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  alert: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
  over: () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  click: () => Haptics.selectionAsync(),
};

export function playSound(kind: SoundKind): void {
  // Fire and forget; unsupported devices (e.g. some Android, web) just no-op.
  void fire[kind]().catch(() => {});
}
