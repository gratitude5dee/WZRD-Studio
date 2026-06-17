import type { AudioTrack, Clip, Keyframe } from '@/store/videoEditorStore';

type ClipTransforms = Clip['transforms'];

interface AudioKeyframeValue {
  volume: number;
  isMuted: boolean;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

const ease = (amount: number, easing?: string) => {
  const t = clamp01(amount);
  if (easing === 'easeIn') return t * t;
  if (easing === 'easeOut') return 1 - (1 - t) * (1 - t);
  if (easing === 'easeInOut') return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  return t;
};

const cloneTransforms = (transforms: ClipTransforms): ClipTransforms => ({
  position: { ...transforms.position },
  scale: { ...transforms.scale },
  rotation: transforms.rotation,
  opacity: transforms.opacity,
});

const keyframeAppliesTo = (keyframe: Keyframe, targetId: string, targetType: Keyframe['targetType']) =>
  keyframe.targetId === targetId && (!keyframe.targetType || keyframe.targetType === targetType);

const getNested = (value: unknown, path: string[]) => {
  let cursor = value;
  for (const part of path) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined;
    cursor = (cursor as Record<string, unknown>)[part];
  }
  return cursor;
};

const transformKeyframesFor = (targetId: string, keyframes: Keyframe[]) =>
  keyframes
    .filter((keyframe) => keyframeAppliesTo(keyframe, targetId, 'clip'))
    .filter((keyframe) => (keyframe.propertyPath ?? '').startsWith('transforms') || 'transforms' in (keyframe.properties ?? {}))
    .sort((left, right) => left.time - right.time);

const audioKeyframesFor = (targetId: string, keyframes: Keyframe[]) =>
  keyframes
    .filter((keyframe) => keyframeAppliesTo(keyframe, targetId, 'audio'))
    .filter((keyframe) => (keyframe.propertyPath ?? '') === 'volume' || 'volume' in (keyframe.properties ?? {}))
    .sort((left, right) => left.time - right.time);

const applyTransformPatch = (base: ClipTransforms, patch: unknown): ClipTransforms => {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return cloneTransforms(base);
  const value = patch as Record<string, unknown>;
  const next = cloneTransforms(base);

  const position = value.position;
  if (position && typeof position === 'object' && !Array.isArray(position)) {
    const positionValue = position as Record<string, unknown>;
    if (isFiniteNumber(positionValue.x)) next.position.x = positionValue.x;
    if (isFiniteNumber(positionValue.y)) next.position.y = positionValue.y;
  }

  const scale = value.scale;
  if (scale && typeof scale === 'object' && !Array.isArray(scale)) {
    const scaleValue = scale as Record<string, unknown>;
    if (isFiniteNumber(scaleValue.x)) next.scale.x = scaleValue.x;
    if (isFiniteNumber(scaleValue.y)) next.scale.y = scaleValue.y;
  }

  if (isFiniteNumber(value.rotation)) next.rotation = value.rotation;
  if (isFiniteNumber(value.opacity)) next.opacity = value.opacity;

  return next;
};

const transformValueFromKeyframe = (base: ClipTransforms, keyframe: Keyframe): ClipTransforms => {
  const directTransforms = keyframe.properties?.transforms;
  if (directTransforms && typeof directTransforms === 'object' && !Array.isArray(directTransforms)) {
    return applyTransformPatch(base, directTransforms);
  }

  const path = (keyframe.propertyPath ?? '').split('.').filter(Boolean);
  if (path[0] !== 'transforms') return cloneTransforms(base);

  const pathValue = getNested(keyframe.properties, path);
  if (isFiniteNumber(pathValue)) {
    return applyTransformPatch(base, {
      [path[1]]: path.length === 2 ? pathValue : undefined,
      ...(path[1] === 'position' && path[2] ? { position: { [path[2]]: pathValue } } : {}),
      ...(path[1] === 'scale' && path[2] ? { scale: { [path[2]]: pathValue } } : {}),
    });
  }

  return applyTransformPatch(base, keyframe.properties);
};

const interpolateTransforms = (
  from: ClipTransforms,
  to: ClipTransforms,
  amount: number,
  easing?: string
): ClipTransforms => {
  const t = ease(amount, easing);
  return {
    position: {
      x: lerp(from.position.x, to.position.x, t),
      y: lerp(from.position.y, to.position.y, t),
    },
    scale: {
      x: lerp(from.scale.x, to.scale.x, t),
      y: lerp(from.scale.y, to.scale.y, t),
    },
    rotation: lerp(from.rotation, to.rotation, t),
    opacity: lerp(from.opacity, to.opacity, t),
  };
};

const audioValueFromKeyframe = (base: AudioKeyframeValue, keyframe: Keyframe): AudioKeyframeValue => ({
  volume: isFiniteNumber(keyframe.properties?.volume) ? keyframe.properties.volume : base.volume,
  isMuted: typeof keyframe.properties?.isMuted === 'boolean' ? keyframe.properties.isMuted : base.isMuted,
});

function findKeyframePair(keyframes: Keyframe[], playheadMs: number) {
  let previous: Keyframe | null = null;
  let next: Keyframe | null = null;

  for (const keyframe of keyframes) {
    if (keyframe.time <= playheadMs) {
      previous = keyframe;
    }
    if (keyframe.time >= playheadMs) {
      next = keyframe;
      break;
    }
  }

  return { previous, next };
}

export function evaluateOpenCutClipAtTime(clip: Clip, keyframes: Keyframe[], playheadMs: number): Clip {
  const transformKeyframes = transformKeyframesFor(clip.id, keyframes);
  if (!transformKeyframes.length) return clip;

  const base = cloneTransforms(clip.transforms);
  const { previous, next } = findKeyframePair(transformKeyframes, playheadMs);

  if (!previous && next) return clip;
  if (previous && (!next || previous.id === next.id || previous.time === next.time)) {
    return {
      ...clip,
      transforms: transformValueFromKeyframe(base, previous),
    };
  }
  if (!previous || !next) return clip;

  const from = transformValueFromKeyframe(base, previous);
  const to = transformValueFromKeyframe(base, next);
  const amount = (playheadMs - previous.time) / Math.max(1, next.time - previous.time);

  return {
    ...clip,
    transforms: interpolateTransforms(from, to, amount, next.easing ?? previous.easing),
  };
}

export function evaluateOpenCutAudioAtTime(track: AudioTrack, keyframes: Keyframe[], playheadMs: number): AudioTrack {
  const volumeKeyframes = audioKeyframesFor(track.id, keyframes);
  if (!volumeKeyframes.length) return track;

  const base: AudioKeyframeValue = {
    volume: track.volume,
    isMuted: track.isMuted,
  };
  const { previous, next } = findKeyframePair(volumeKeyframes, playheadMs);

  if (!previous && next) return track;
  if (previous && (!next || previous.id === next.id || previous.time === next.time)) {
    return {
      ...track,
      ...audioValueFromKeyframe(base, previous),
    };
  }
  if (!previous || !next) return track;

  const from = audioValueFromKeyframe(base, previous);
  const to = audioValueFromKeyframe(base, next);
  const amount = ease((playheadMs - previous.time) / Math.max(1, next.time - previous.time), next.easing ?? previous.easing);

  return {
    ...track,
    volume: lerp(from.volume, to.volume, amount),
    isMuted: from.isMuted,
  };
}
