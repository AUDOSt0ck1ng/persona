import type { AnimationType } from './animation-catalog';

export interface BodyAnimationOverride {
  animation: AnimationType;
  requestId: number;
}

export function resolveBodyAnimation(
  voiceAnimation: AnimationType,
  override: BodyAnimationOverride | null,
): AnimationType {
  return override?.animation ?? voiceAnimation;
}

export function finishBodyAnimationOverride(
  override: BodyAnimationOverride | null,
  requestId: number,
): BodyAnimationOverride | null {
  return override?.requestId === requestId ? null : override;
}
