/**
 * Tiny haptic feedback helper.
 * - Android: uses navigator.vibrate (Vibration API)
 * - iOS Safari: no native haptic API for web; safely no-ops
 */
type Intensity = "light" | "medium" | "heavy";

const PATTERN: Record<Intensity, number> = {
  light: 10,
  medium: 20,
  heavy: 30,
};

export function haptic(intensity: Intensity = "light") {
  if (typeof window === "undefined") return;
  const nav = window.navigator as Navigator & {
    vibrate?: (pattern: number | number[]) => boolean;
  };
  if (typeof nav.vibrate === "function") {
    try {
      nav.vibrate(PATTERN[intensity]);
    } catch {
      // ignore
    }
  }
}
