import { asString, formatSecondsForFfmpeg } from "./clip-studio-ffmpeg.js";

function asFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function positiveNumber(value, fallback = 1) {
  return Math.max(1, asFiniteNumber(value, fallback));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function msToSeconds(ms) {
  return formatSecondsForFfmpeg(asFiniteNumber(ms) / 1000);
}

function fixed(value) {
  return Number(value).toFixed(3);
}

function normalizeColor(color) {
  const value = asString(color) ?? "#000000";
  const match = value.match(/^#?([0-9a-fA-F]{6})$/);
  return match ? `0x${match[1]}` : "0x000000";
}

function isHexColor(color) {
  const value = asString(color);
  return Boolean(value?.match(/^#?([0-9a-fA-F]{6})$/));
}

function normalizeHexColor(color, fallback = "000000") {
  const value = asString(color) ?? fallback;
  const match = value.match(/^#?([0-9a-fA-F]{6})$/);
  return match ? match[1] : fallback;
}

function qualityToCrf(quality) {
  switch (quality) {
    case "low":
      return "28";
    case "medium":
      return "23";
    case "4k":
      return "16";
    case "high":
    default:
      return "18";
  }
}

function startMs(track) {
  return Math.max(0, Math.round(asFiniteNumber(track?.startMs)));
}

function durationMs(track) {
  return Math.max(1, Math.round(asFiniteNumber(track?.durationMs, 1)));
}

function playbackRateForTrack(track) {
  const rate = asFiniteNumber(track?.playbackRate, 1);
  return rate > 0 ? Math.max(0.01, rate) : 1;
}

function sourceDurationMs(track) {
  return Math.max(1, Math.round(durationMs(track) * playbackRateForTrack(track)));
}

function trimStartMs(track) {
  return Math.max(0, Math.round(asFiniteNumber(track?.trimStartMs)));
}

function opacityForTrack(track) {
  const transformOpacity = asFiniteNumber(track?.transform?.opacity, Number.NaN);
  const trackOpacity = asFiniteNumber(track?.opacity, Number.NaN);
  const opacity = Number.isFinite(trackOpacity) ? trackOpacity : transformOpacity;
  return clamp(Number.isFinite(opacity) ? opacity : 1, 0, 1);
}

const supportedEditorEffectIds = new Set([
  "blur",
  "brightness",
  "contrast",
  "saturation",
  "exposure",
  "sharpen",
  "grayscale",
  "sepia",
  "invert",
  "vignette",
  "grain",
  "noise",
]);

const supportedEditorMaskTypes = new Set(["rectangle", "ellipse"]);

function effectId(effect) {
  return (asString(effect?.id) ?? asString(effect?.name) ?? "").trim().toLowerCase();
}

function effectParam(effect, names, fallback = 0) {
  const params = effect?.params ?? {};
  for (const name of names) {
    const value = asFiniteNumber(params[name], Number.NaN);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function effectPercent(value, fallback = 100) {
  const numeric = asFiniteNumber(value, fallback);
  return numeric > 2 ? numeric / 100 : numeric;
}

function validateEditorEffects(effects, label) {
  if (!Array.isArray(effects)) return;
  for (const effect of effects) {
    const id = effectId(effect);
    if (!supportedEditorEffectIds.has(id)) {
      throw new Error(`${label} uses effect "${effect?.name ?? effect?.id ?? "unknown"}", which is not supported by local FFmpeg render yet.`);
    }
  }
}

function validateEditorMasks(masks, label) {
  if (!Array.isArray(masks)) return;
  for (const mask of masks) {
    if (!supportedEditorMaskTypes.has(mask?.type)) {
      throw new Error(`${label} uses mask "${mask?.id ?? "unknown"}", which is not supported by local FFmpeg render yet.`);
    }
  }
}

function buildEditorEffectFilters(effects) {
  if (!Array.isArray(effects) || effects.length === 0) return [];

  const filters = [];
  const eq = {};

  for (const effect of effects) {
    const id = effectId(effect);
    switch (id) {
      case "blur": {
        const amount = Math.max(0, effectParam(effect, ["amount", "radius"], 0));
        if (amount > 0) filters.push(`boxblur=${fixed(amount)}`);
        break;
      }
      case "brightness": {
        eq.brightness = fixed(clamp(effectPercent(effectParam(effect, ["value", "amount"], 100), 100) - 1, -1, 1));
        break;
      }
      case "exposure": {
        const current = asFiniteNumber(eq.brightness, 0);
        eq.brightness = fixed(clamp(current + effectParam(effect, ["value", "amount"], 0) / 100, -1, 1));
        break;
      }
      case "contrast": {
        eq.contrast = fixed(clamp(effectPercent(effectParam(effect, ["value", "amount"], 100), 100), 0, 4));
        break;
      }
      case "saturation": {
        eq.saturation = fixed(clamp(effectPercent(effectParam(effect, ["value", "amount"], 100), 100), 0, 4));
        break;
      }
      case "sharpen": {
        const amount = clamp(effectParam(effect, ["amount", "value"], 0) / 50, 0, 5);
        if (amount > 0) filters.push(`unsharp=5:5:${fixed(amount)}:5:5:0.000`);
        break;
      }
      case "grayscale": {
        const amount = clamp(effectPercent(effectParam(effect, ["amount", "value"], 0), 0), 0, 1);
        if (amount > 0) filters.push(`hue=s=${fixed(1 - amount)}`);
        break;
      }
      case "sepia": {
        const amount = clamp(effectPercent(effectParam(effect, ["amount", "value"], 0), 0), 0, 1);
        if (amount > 0) {
          filters.push("colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131");
        }
        break;
      }
      case "invert": {
        const amount = clamp(effectPercent(effectParam(effect, ["amount", "value"], 0), 0), 0, 1);
        if (amount > 0) filters.push("negate");
        break;
      }
      case "vignette": {
        const amount = clamp(effectPercent(effectParam(effect, ["intensity", "amount", "value"], 0), 0), 0, 1);
        if (amount > 0) filters.push(`vignette=angle=PI/4:eval=frame`);
        break;
      }
      case "grain":
      case "noise": {
        const amount = clamp(effectParam(effect, ["amount", "value"], 0), 0, 100);
        if (amount > 0) filters.push(`noise=alls=${fixed(amount)}:allf=t+u`);
        break;
      }
    }
  }

  const eqParts = ["brightness", "contrast", "saturation"]
    .filter((key) => eq[key] !== undefined)
    .map((key) => `${key}=${eq[key]}`);
  if (eqParts.length > 0) {
    filters.push(`eq=${eqParts.join(":")}`);
  }

  return filters;
}

function maskOpacity(mask) {
  return fixed(clamp(asFiniteNumber(mask?.opacity, 1), 0, 1));
}

function buildEditorMaskFilters(masks) {
  if (!Array.isArray(masks) || masks.length === 0) return [];

  return masks.map((mask) => {
    const opacity = maskOpacity(mask);
    if (mask?.type === "ellipse") {
      const condition = "((X-W/2)*(X-W/2))/(W*W*0.2025)+((Y-H/2)*(Y-H/2))/(H*H*0.2025)<=1";
      const alpha = mask?.inverted ? `if(${condition},0,alpha(X,Y)*${opacity})` : `if(${condition},alpha(X,Y)*${opacity},0)`;
      return `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${alpha}'`;
    }

    const condition = "between(X,W*0.1,W*0.9)*between(Y,H*0.1,H*0.9)";
    const alpha = mask?.inverted ? `if(${condition},0,alpha(X,Y)*${opacity})` : `if(${condition},alpha(X,Y)*${opacity},0)`;
    return `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${alpha}'`;
  });
}

function scaleForTrack(track) {
  const scale = track?.transform?.scale ?? {};
  return {
    x: Math.max(0.01, Math.abs(asFiniteNumber(scale.x, 1))),
    y: Math.max(0.01, Math.abs(asFiniteNumber(scale.y, 1))),
  };
}

function positionForTrack(track) {
  const position = track?.transform?.position ?? {};
  return {
    x: Math.round(asFiniteNumber(position.x)),
    y: Math.round(asFiniteNumber(position.y)),
  };
}

function keyframesForTrack(track, targetType) {
  const keyframes = Array.isArray(track?.keyframes) ? track.keyframes : [];
  return keyframes
    .filter((keyframe) => !keyframe?.targetId || keyframe.targetId === track?.id)
    .filter((keyframe) => !keyframe?.targetType || keyframe.targetType === targetType)
    .filter((keyframe) => Number.isFinite(Number(keyframe?.time)))
    .sort((left, right) => asFiniteNumber(left.time) - asFiniteNumber(right.time));
}

function getNestedValue(value, path) {
  let cursor = value;
  for (const part of path) {
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return undefined;
    cursor = cursor[part];
  }
  return cursor;
}

function cloneTrackTransform(track) {
  const transform = track?.transform ?? {};
  const position = transform.position ?? {};
  const scale = transform.scale ?? {};
  return {
    position: {
      x: asFiniteNumber(position.x),
      y: asFiniteNumber(position.y),
    },
    scale: {
      x: asFiniteNumber(scale.x, 1),
      y: asFiniteNumber(scale.y, 1),
    },
    rotation: asFiniteNumber(transform.rotation),
    opacity: clamp(asFiniteNumber(transform.opacity, opacityForTrack(track)), 0, 1),
  };
}

function applyTransformPatch(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return base;
  const next = {
    position: { ...base.position },
    scale: { ...base.scale },
    rotation: base.rotation,
    opacity: base.opacity,
  };

  if (patch.position && typeof patch.position === "object" && !Array.isArray(patch.position)) {
    if (Number.isFinite(Number(patch.position.x))) next.position.x = asFiniteNumber(patch.position.x);
    if (Number.isFinite(Number(patch.position.y))) next.position.y = asFiniteNumber(patch.position.y);
  }
  if (patch.scale && typeof patch.scale === "object" && !Array.isArray(patch.scale)) {
    if (Number.isFinite(Number(patch.scale.x))) next.scale.x = asFiniteNumber(patch.scale.x, next.scale.x);
    if (Number.isFinite(Number(patch.scale.y))) next.scale.y = asFiniteNumber(patch.scale.y, next.scale.y);
  }
  if (Number.isFinite(Number(patch.rotation))) next.rotation = asFiniteNumber(patch.rotation);
  if (Number.isFinite(Number(patch.opacity))) next.opacity = clamp(asFiniteNumber(patch.opacity), 0, 1);

  return next;
}

function visualTransformFromKeyframe(track, keyframe) {
  const base = cloneTrackTransform(track);
  const properties = keyframe?.properties ?? {};
  const directTransforms = properties.transforms;
  if (directTransforms && typeof directTransforms === "object" && !Array.isArray(directTransforms)) {
    return applyTransformPatch(base, directTransforms);
  }

  const path = (asString(keyframe?.propertyPath) ?? "").split(".").filter(Boolean);
  if (path[0] !== "transforms") return base;
  const value = getNestedValue(properties, path);
  if (Number.isFinite(Number(value))) {
    if (path[1] === "position" && path[2]) {
      return applyTransformPatch(base, { position: { [path[2]]: asFiniteNumber(value) } });
    }
    if (path[1] === "scale" && path[2]) {
      return applyTransformPatch(base, { scale: { [path[2]]: asFiniteNumber(value) } });
    }
    return applyTransformPatch(base, { [path[1]]: asFiniteNumber(value) });
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return applyTransformPatch(base, { [path[1]]: value });
  }
  return applyTransformPatch(base, properties);
}

function visualKeyframeTargetsProperty(keyframe, property) {
  const properties = keyframe?.properties ?? {};
  const directTransforms = properties.transforms;
  if (directTransforms && typeof directTransforms === "object" && !Array.isArray(directTransforms)) {
    return property in directTransforms;
  }

  const path = (asString(keyframe?.propertyPath) ?? "").split(".").filter(Boolean);
  if (path[0] === "transforms" && path[1]) {
    return path[1] === property;
  }

  return property in properties;
}

function visualKeyframeTransformProperties(keyframe) {
  const properties = keyframe?.properties ?? {};
  const directTransforms = properties.transforms;
  if (directTransforms && typeof directTransforms === "object" && !Array.isArray(directTransforms)) {
    return Object.keys(directTransforms);
  }

  const path = (asString(keyframe?.propertyPath) ?? "").split(".").filter(Boolean);
  if (path[0] === "transforms" && path[1]) return [path[1]];

  return ["position", "scale", "rotation", "opacity"].filter((property) => property in properties);
}

function unsupportedVisualKeyframeReason(track, keyframe) {
  const path = asString(keyframe?.propertyPath) ?? "";
  const properties = keyframe?.properties ?? {};
  if (!path.startsWith("transforms") && !("transforms" in properties)) {
    return `keyframe property "${path || "unknown"}"`;
  }

  const supportedTransformProperties = new Set(["position", "scale", "rotation", "opacity"]);
  const unsupportedTransformProperty = visualKeyframeTransformProperties(keyframe)
    .find((property) => !supportedTransformProperties.has(property));
  if (unsupportedTransformProperty) {
    return `transform keyframe property "${unsupportedTransformProperty}"`;
  }

  return null;
}

function validateSupportedVisualKeyframes(track, label) {
  for (const keyframe of keyframesForTrack(track, "clip")) {
    const reason = unsupportedVisualKeyframeReason(track, keyframe);
    if (reason) {
      throw new Error(`${label} uses ${reason}, which are not supported by local render yet.`);
    }
  }
}

function validateSupportedAudioKeyframes(track, label) {
  for (const keyframe of keyframesForTrack(track, "audio")) {
    const path = asString(keyframe?.propertyPath) ?? "";
    const properties = keyframe?.properties ?? {};
    const supportsVolume = path === "volume" || path === "isMuted" || "volume" in properties || "isMuted" in properties;
    if (!supportsVolume) {
      throw new Error(`${label} uses keyframe property "${path || "unknown"}", which is not supported by local render yet.`);
    }
  }
}

function buildLinearExpression(points, fallback) {
  const ordered = points
    .filter((point) => Number.isFinite(point.time) && Number.isFinite(point.value))
    .sort((left, right) => left.time - right.time);
  if (ordered.length === 0) return fixed(fallback);
  if (ordered.length === 1) return fixed(ordered[0].value);

  let expression = fixed(ordered.at(-1).value);
  for (let index = ordered.length - 2; index >= 0; index -= 1) {
    const from = ordered[index];
    const to = ordered[index + 1];
    const duration = Math.max(0.001, to.time - from.time);
    const segment = `(${fixed(from.value)}+(${fixed(to.value)}-${fixed(from.value)})*(t-${fixed(from.time)})/${fixed(duration)})`;
    expression = `if(lte(t,${fixed(to.time)}),${segment},${expression})`;
  }

  return `if(lt(t,${fixed(ordered[0].time)}),${fixed(ordered[0].value)},${expression})`;
}

function appendCenteredOffset(baseExpression, offsetExpression) {
  return offsetExpression.startsWith("-") ? `${baseExpression}${offsetExpression}` : `${baseExpression}+${offsetExpression}`;
}

function positionExpressionForTrack(track, axis) {
  const basePosition = positionForTrack(track);
  const start = startMs(track) / 1000;
  const positionKeyframes = keyframesForTrack(track, "clip")
    .filter((keyframe) => visualKeyframeTargetsProperty(keyframe, "position"))
    .filter((keyframe) => !unsupportedVisualKeyframeReason(track, keyframe));
  if (positionKeyframes.length === 0) return fixed(basePosition[axis]);

  const points = positionKeyframes.map((keyframe) => ({
    time: asFiniteNumber(keyframe.time) / 1000,
    value: visualTransformFromKeyframe(track, keyframe).position[axis],
  }));
  if (points[0]?.time > start) {
    points.unshift({ time: start, value: basePosition[axis] });
  }

  return buildLinearExpression(points, basePosition[axis]);
}

function visualTransformExpressionForTrack(track, property, valueForTransform, fallback) {
  const start = startMs(track) / 1000;
  const keyframes = keyframesForTrack(track, "clip")
    .filter((keyframe) => visualKeyframeTargetsProperty(keyframe, property))
    .filter((keyframe) => !unsupportedVisualKeyframeReason(track, keyframe));
  if (keyframes.length === 0) return fixed(fallback);

  const points = keyframes.map((keyframe) => ({
    time: asFiniteNumber(keyframe.time) / 1000,
    value: valueForTransform(visualTransformFromKeyframe(track, keyframe)),
  }));
  if (points[0]?.time > start) {
    points.unshift({ time: start, value: fallback });
  }

  return buildLinearExpression(points, fallback);
}

function visualKeyframeValuesForProperty(track, property, valueForTransform, fallback) {
  const values = [fallback];
  for (const keyframe of keyframesForTrack(track, "clip")) {
    if (!visualKeyframeTargetsProperty(keyframe, property) || unsupportedVisualKeyframeReason(track, keyframe)) {
      continue;
    }
    values.push(valueForTransform(visualTransformFromKeyframe(track, keyframe)));
  }
  return values.filter((value) => Number.isFinite(value));
}

function scalePlanForTrack(track, width, height) {
  const baseScale = scaleForTrack(track);
  const hasScaleKeyframes = keyframesForTrack(track, "clip")
    .some((keyframe) => visualKeyframeTargetsProperty(keyframe, "scale") && !unsupportedVisualKeyframeReason(track, keyframe));

  if (!hasScaleKeyframes) {
    const scaledWidth = Math.max(1, Math.round(width * baseScale.x));
    const scaledHeight = Math.max(1, Math.round(height * baseScale.y));
    return {
      filter: `scale=${scaledWidth}:${scaledHeight}:force_original_aspect_ratio=decrease,pad=${scaledWidth}:${scaledHeight}:(ow-iw)/2:(oh-ih)/2:color=black@0`,
      width: scaledWidth,
      height: scaledHeight,
    };
  }

  const widthFallback = Math.max(1, width * baseScale.x);
  const heightFallback = Math.max(1, height * baseScale.y);
  const widthExpression = visualTransformExpressionForTrack(
    track,
    "scale",
    (transform) => Math.max(1, width * Math.max(0.01, Math.abs(asFiniteNumber(transform.scale.x, baseScale.x)))),
    widthFallback,
  );
  const heightExpression = visualTransformExpressionForTrack(
    track,
    "scale",
    (transform) => Math.max(1, height * Math.max(0.01, Math.abs(asFiniteNumber(transform.scale.y, baseScale.y)))),
    heightFallback,
  );
  const widthValues = visualKeyframeValuesForProperty(
    track,
    "scale",
    (transform) => Math.max(1, width * Math.max(0.01, Math.abs(asFiniteNumber(transform.scale.x, baseScale.x)))),
    widthFallback,
  );
  const heightValues = visualKeyframeValuesForProperty(
    track,
    "scale",
    (transform) => Math.max(1, height * Math.max(0.01, Math.abs(asFiniteNumber(transform.scale.y, baseScale.y)))),
    heightFallback,
  );
  const maxWidth = Math.max(1, Math.round(Math.max(...widthValues)));
  const maxHeight = Math.max(1, Math.round(Math.max(...heightValues)));

  return {
    filter: `scale=w='${widthExpression}':h='${heightExpression}':eval=frame:force_original_aspect_ratio=decrease,pad=${maxWidth}:${maxHeight}:(ow-iw)/2:(oh-ih)/2:color=black@0`,
    width: maxWidth,
    height: maxHeight,
  };
}

function opacityFilterForTrack(track) {
  const baseOpacity = opacityForTrack(track);
  const hasOpacityKeyframes = keyframesForTrack(track, "clip")
    .some((keyframe) => visualKeyframeTargetsProperty(keyframe, "opacity") && !unsupportedVisualKeyframeReason(track, keyframe));

  if (!hasOpacityKeyframes) {
    return baseOpacity < 0.999 ? `,colorchannelmixer=aa=${fixed(baseOpacity)}` : "";
  }

  const expression = visualTransformExpressionForTrack(
    track,
    "opacity",
    (transform) => clamp(asFiniteNumber(transform.opacity, baseOpacity), 0, 1),
    baseOpacity,
  );
  return `,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*${expression}'`;
}

function hasSupportedVisualKeyframesForTrack(track, property) {
  return keyframesForTrack(track, "clip")
    .some((keyframe) => visualKeyframeTargetsProperty(keyframe, property) && !unsupportedVisualKeyframeReason(track, keyframe));
}

function rotationFilterForTrack(track, width, height) {
  const baseRotation = asFiniteNumber(track?.transform?.rotation);
  const hasRotationKeyframes = keyframesForTrack(track, "clip")
    .some((keyframe) => visualKeyframeTargetsProperty(keyframe, "rotation") && !unsupportedVisualKeyframeReason(track, keyframe));

  if (!hasRotationKeyframes && Math.abs(baseRotation) < 0.001) return "";

  const expression = visualTransformExpressionForTrack(
    track,
    "rotation",
    (transform) => degreesToRadians(asFiniteNumber(transform.rotation, baseRotation)),
    degreesToRadians(baseRotation),
  );
  const canvasSize = Math.max(1, Math.ceil(Math.hypot(width, height)));

  return `,rotate='${expression}':ow=${canvasSize}:oh=${canvasSize}:fillcolor=black@0`;
}

function audioVolumeExpressionForTrack(track) {
  const baseVolume = track?.muted ? 0 : Math.max(0, asFiniteNumber(track?.volume, 1));
  const volumeKeyframes = keyframesForTrack(track, "audio");
  if (volumeKeyframes.length === 0) return fixed(baseVolume);

  const start = startMs(track);
  const points = volumeKeyframes.map((keyframe) => {
    const properties = keyframe?.properties ?? {};
    const muted = typeof properties.isMuted === "boolean" ? properties.isMuted : false;
    const volume = Number.isFinite(Number(properties.volume)) ? Math.max(0, asFiniteNumber(properties.volume, baseVolume)) : baseVolume;
    return {
      time: Math.max(0, (asFiniteNumber(keyframe.time) - start) / 1000),
      value: muted ? 0 : volume,
    };
  });
  if (points[0]?.time > 0) {
    points.unshift({ time: 0, value: baseVolume });
  }

  return buildLinearExpression(points, baseVolume);
}

function retimedVideoSetpts(track, startSeconds) {
  const rate = playbackRateForTrack(track);
  if (Math.abs(rate - 1) < 0.001) {
    return `setpts=PTS-STARTPTS+${fixed(startSeconds)}/TB`;
  }
  return `setpts=(PTS-STARTPTS)/${fixed(rate)}+${fixed(startSeconds)}/TB`;
}

function atempoFilters(rate) {
  if (Math.abs(rate - 1) < 0.001) return [];
  const filters = [];
  let remaining = rate;

  while (remaining < 0.5) {
    filters.push("atempo=0.500");
    remaining /= 0.5;
  }

  while (remaining > 2) {
    filters.push("atempo=2.000");
    remaining /= 2;
  }

  if (Math.abs(remaining - 1) >= 0.001) {
    filters.push(`atempo=${fixed(remaining)}`);
  }

  return filters;
}

function escapeDrawtextText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/:/g, "\\:")
    .replace(/%/g, "\\%");
}

function textForTrack(track) {
  return asString(track?.text) ?? asString(track?.name) ?? "";
}

function textFontSizeForTrack(track, scale = scaleForTrack(track)) {
  const style = track?.style ?? {};
  const scaled = asFiniteNumber(style.fontSize, 72) * Math.max(scale.x, scale.y);
  return Math.max(1, Math.round(scaled));
}

function textColorForTrack(track, opacity = opacityForTrack(track)) {
  const style = track?.style ?? {};
  return `${normalizeColor(style.color ?? "#ffffff")}@${fixed(opacity)}`;
}

function textBoxForTrack(track, opacity = opacityForTrack(track)) {
  const backgroundColor = track?.style?.backgroundColor;
  if (!isHexColor(backgroundColor)) return "";
  return `:box=1:boxcolor=${normalizeColor(backgroundColor)}@${fixed(opacity)}:boxborderw=12`;
}

function textLayerSizeForTrack(track, scale = scaleForTrack(track)) {
  const fontSize = textFontSizeForTrack(track, scale);
  const padding = isHexColor(track?.style?.backgroundColor) ? 24 : 0;
  const textWidth = Math.ceil(Math.max(1, textForTrack(track).length) * fontSize * 0.62);
  return {
    width: Math.max(1, textWidth + padding * 2),
    height: Math.max(1, Math.ceil(fontSize * 1.3) + padding * 2),
  };
}

function buildTextVisualFilters({ track, previous, next, prepared, composition }) {
  const start = startMs(track) / 1000;
  const end = (startMs(track) + durationMs(track)) / 1000;
  const hasOpacityKeyframes = hasSupportedVisualKeyframesForTrack(track, "opacity");
  const hasScaleKeyframes = hasSupportedVisualKeyframesForTrack(track, "scale");
  const drawScale = hasScaleKeyframes ? { x: 1, y: 1 } : scaleForTrack(track);
  const size = textLayerSizeForTrack(track, drawScale);
  const scalePlan = hasScaleKeyframes ? scalePlanForTrack(track, size.width, size.height) : null;
  const rotationFilter = rotationFilterForTrack(track, scalePlan?.width ?? size.width, scalePlan?.height ?? size.height);
  if (!rotationFilter && !hasOpacityKeyframes && !hasScaleKeyframes) {
    const x = appendCenteredOffset("(w-text_w)/2", positionExpressionForTrack(track, "x"));
    const y = appendCenteredOffset("(h-text_h)/2", positionExpressionForTrack(track, "y"));
    return [`[${previous}]drawtext=text='${escapeDrawtextText(textForTrack(track))}':x=${x}:y=${y}:fontsize=${textFontSizeForTrack(track)}:fontcolor=${textColorForTrack(track)}${textBoxForTrack(track)}:enable='between(t,${fixed(start)},${fixed(end)})'[${next}]`];
  }

  const layer = `${prepared}Layer`;
  const drawn = `${prepared}Drawn`;
  const duration = getTimelineDurationSeconds({ composition });
  const fps = positiveNumber(composition?.fps, 30);
  const x = appendCenteredOffset("(W-w)/2", positionExpressionForTrack(track, "x"));
  const y = appendCenteredOffset("(H-h)/2", positionExpressionForTrack(track, "y"));
  const opacityFilter = hasOpacityKeyframes ? opacityFilterForTrack(track) : "";
  const textOpacity = hasOpacityKeyframes ? 1 : opacityForTrack(track);
  const scaleFilter = scalePlan ? `,${scalePlan.filter},format=rgba` : "";

  return [
    `color=c=black@0:s=${size.width}x${size.height}:r=${fixed(fps)}:d=${fixed(duration)},format=rgba[${layer}]`,
    `[${layer}]drawtext=text='${escapeDrawtextText(textForTrack(track))}':x=(w-text_w)/2:y=(h-text_h)/2:fontsize=${textFontSizeForTrack(track, drawScale)}:fontcolor=${textColorForTrack(track, textOpacity)}${textBoxForTrack(track, textOpacity)}[${drawn}]`,
    `[${drawn}]format=rgba${scaleFilter}${opacityFilter}${rotationFilter}[${prepared}]`,
    `[${previous}][${prepared}]overlay=x=${x}:y=${y}:enable='between(t,${fixed(start)},${fixed(end)})'[${next}]`,
  ];
}

function elementColorForTrack(track, opacity = opacityForTrack(track)) {
  return `${normalizeColor(track?.element?.color ?? "#ffffff")}@${fixed(opacity)}`;
}

function elementShapeForTrack(track) {
  return (asString(track?.element?.shape) ?? "rectangle").toLowerCase();
}

function elementTypeForTrack(track) {
  return (asString(track?.element?.elementType) ?? "shape").toLowerCase();
}

function elementSizeForTrack(track, scale = scaleForTrack(track)) {
  const element = track?.element ?? {};
  const isLine = elementTypeForTrack(track) === "line";
  const baseWidth = isLine ? 360 : 320;
  const baseHeight = isLine ? Math.max(2, asFiniteNumber(element.strokeWidth, 4)) : 180;
  return {
    width: Math.max(1, Math.round(baseWidth * scale.x)),
    height: Math.max(1, Math.round(baseHeight * scale.y)),
  };
}

function buildGraphicElementFilters({ track, previous, next, prepared, composition }) {
  const start = startMs(track) / 1000;
  const end = (startMs(track) + durationMs(track)) / 1000;
  const hasOpacityKeyframes = hasSupportedVisualKeyframesForTrack(track, "opacity");
  const hasScaleKeyframes = hasSupportedVisualKeyframesForTrack(track, "scale");
  const shape = elementShapeForTrack(track);
  const elementType = elementTypeForTrack(track);
  const isLine = elementType === "line";
  const requiresLayer = shape === "ellipse" || isLine;
  const drawScale = hasScaleKeyframes ? { x: 1, y: 1 } : scaleForTrack(track);
  const size = elementSizeForTrack(track, drawScale);
  const scalePlan = hasScaleKeyframes ? scalePlanForTrack(track, size.width, size.height) : null;
  const rotationFilter = rotationFilterForTrack(track, scalePlan?.width ?? size.width, scalePlan?.height ?? size.height);
  if (!rotationFilter && !hasOpacityKeyframes && !hasScaleKeyframes && !requiresLayer) {
    const x = appendCenteredOffset(`(w-${size.width})/2`, positionExpressionForTrack(track, "x"));
    const y = appendCenteredOffset(`(h-${size.height})/2`, positionExpressionForTrack(track, "y"));
    return [`[${previous}]drawbox=x=${x}:y=${y}:w=${size.width}:h=${size.height}:color=${elementColorForTrack(track)}:t=fill:enable='between(t,${fixed(start)},${fixed(end)})'[${next}]`];
  }

  const layer = `${prepared}Layer`;
  const drawn = `${prepared}Drawn`;
  const duration = getTimelineDurationSeconds({ composition });
  const fps = positiveNumber(composition?.fps, 30);
  const x = appendCenteredOffset("(W-w)/2", positionExpressionForTrack(track, "x"));
  const y = appendCenteredOffset("(H-h)/2", positionExpressionForTrack(track, "y"));
  const opacityFilter = hasOpacityKeyframes ? opacityFilterForTrack(track) : "";
  const elementOpacity = hasOpacityKeyframes ? 1 : opacityForTrack(track);
  const scaleFilter = scalePlan ? `,${scalePlan.filter},format=rgba` : "";
  const lineAlphaExpression = "if(between(X,H/2,W-H/2),alpha(X,Y),if(lte(pow(X-H/2,2)+pow(Y-H/2,2),pow(H/2,2)),alpha(X,Y),if(lte(pow(X-(W-H/2),2)+pow(Y-H/2,2),pow(H/2,2)),alpha(X,Y),0)))";
  const drawFilter = isLine
    ? `color=c=${elementColorForTrack(track, elementOpacity)}:s=${size.width}x${size.height}:r=${fixed(fps)}:d=${fixed(duration)},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${lineAlphaExpression}'[${drawn}]`
    : shape === "ellipse"
      ? `color=c=${elementColorForTrack(track, elementOpacity)}:s=${size.width}x${size.height}:r=${fixed(fps)}:d=${fixed(duration)},format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(pow((X-W/2)/(W/2),2)+pow((Y-H/2)/(H/2),2),1),alpha(X,Y),0)'[${drawn}]`
      : `[${layer}]drawbox=x=0:y=0:w=${size.width}:h=${size.height}:color=${elementColorForTrack(track, elementOpacity)}:t=fill[${drawn}]`;

  const filters = requiresLayer ? [drawFilter] : [
    `color=c=black@0:s=${size.width}x${size.height}:r=${fixed(fps)}:d=${fixed(duration)},format=rgba[${layer}]`,
    drawFilter,
  ];

  return [
    ...filters,
    `[${drawn}]format=rgba${scaleFilter}${opacityFilter}${rotationFilter}[${prepared}]`,
    `[${previous}][${prepared}]overlay=x=${x}:y=${y}:enable='between(t,${fixed(start)},${fixed(end)})'[${next}]`,
  ];
}

function visualInputArgs(track) {
  const args = [];
  if (track.type === "image") {
    args.push("-loop", "1", "-t", msToSeconds(durationMs(track)), "-i", track.sourcePath);
    return args;
  }

  const trimStart = trimStartMs(track);
  if (trimStart > 0) {
    args.push("-ss", msToSeconds(trimStart));
  }
  args.push("-t", msToSeconds(sourceDurationMs(track)), "-i", track.sourcePath);
  return args;
}

function audioInputArgs(track) {
  const args = [];
  const trimStart = trimStartMs(track);
  if (trimStart > 0) {
    args.push("-ss", msToSeconds(trimStart));
  }
  args.push("-t", msToSeconds(sourceDurationMs(track)), "-i", track.sourcePath);
  return args;
}

function validateSourcePath(sourcePath, label) {
  const resolved = asString(sourcePath);
  if (!resolved) {
    throw new Error(`${label} is missing a local source path.`);
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(resolved) && !resolved.startsWith("file://")) {
    throw new Error(`${label} must be downloaded or cached locally before local FFmpeg render.`);
  }
  return resolved.startsWith("file://") ? decodeURIComponent(new URL(resolved).pathname) : resolved;
}

function validateOutputPath(outputPath, label = "Output") {
  const resolved = asString(outputPath);
  if (!resolved) {
    throw new Error(`${label} is missing a local output path.`);
  }
  return resolved.startsWith("file://") ? decodeURIComponent(new URL(resolved).pathname) : resolved;
}

function validateSourcePaths(sourcePaths, label, minCount = 1) {
  const values = Array.isArray(sourcePaths) ? sourcePaths : [sourcePaths];
  const paths = values
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .map((value, index) => validateSourcePath(value, `${label} ${index + 1}`));
  if (paths.length < minCount) {
    throw new Error(`${label} needs at least ${minCount} local source path${minCount === 1 ? "" : "s"}.`);
  }
  return paths;
}

function commonVideoEncodeArgs(outputPath, { crf = "18", includeAudio = true } = {}) {
  const args = [
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    String(crf),
    "-pix_fmt",
    "yuv420p",
  ];
  if (includeAudio) {
    args.push("-c:a", "aac", "-b:a", "192k");
  }
  args.push("-movflags", "+faststart", outputPath);
  return args;
}

function commonAudioEncodeArgs(outputPath) {
  return ["-c:a", "aac", "-b:a", "192k", outputPath];
}

function numberParam(value, fallback, min = -Infinity, max = Infinity) {
  return clamp(asFiniteNumber(value, fallback), min, max);
}

function degreesToRadians(value) {
  return (asFiniteNumber(value) * Math.PI) / 180;
}

function parseAspectRatio(value) {
  const raw = asString(value) ?? "16:9";
  const match = raw.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
  if (!match) return { width: 16, height: 9 };
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { width: 16, height: 9 };
  }
  return { width, height };
}

export function buildRenderPreviewProxyArgs({ sourcePath, outputPath, maxWidth = 1280, maxHeight = 720 } = {}) {
  const source = validateSourcePath(sourcePath, "Preview proxy source");
  const output = validateOutputPath(outputPath, "Preview proxy output");
  const width = positiveNumber(maxWidth, 1280);
  const height = positiveNumber(maxHeight, 720);
  return [
    "-y",
    "-i",
    source,
    "-vf",
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,format=yuv420p`,
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    ...commonVideoEncodeArgs(output),
  ];
}

export function buildExtractWaveformPcmArgs({ sourcePath, sampleRate = 8000 } = {}) {
  const source = validateSourcePath(sourcePath, "Waveform source");
  const rate = Math.round(numberParam(sampleRate, 8000, 100, 48000));
  return [
    "-v",
    "error",
    "-i",
    source,
    "-map",
    "0:a:0",
    "-vn",
    "-ac",
    "1",
    "-ar",
    String(rate),
    "-f",
    "f32le",
    "pipe:1",
  ];
}

export function buildStudioConcatArgs({ sourcePaths, outputPath } = {}) {
  const sources = validateSourcePaths(sourcePaths, "Video concat input", 2);
  const output = validateOutputPath(outputPath, "Video concat output");
  const args = ["-y"];
  sources.forEach((source) => args.push("-i", source));
  const inputs = sources.map((_, index) => `[${index}:v:0][${index}:a:0]`).join("");
  args.push(
    "-filter_complex",
    `${inputs}concat=n=${sources.length}:v=1:a=1[vout][aout]`,
    "-map",
    "[vout]",
    "-map",
    "[aout]",
    ...commonVideoEncodeArgs(output),
  );
  return args;
}

export function buildStudioMergeAudioVideoArgs({ videoPath, audioPath, outputPath } = {}) {
  const video = validateSourcePath(videoPath, "Merge video input");
  const audio = validateSourcePath(audioPath, "Merge audio input");
  const output = validateOutputPath(outputPath, "Merged video output");
  return [
    "-y",
    "-i",
    video,
    "-i",
    audio,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-shortest",
    ...commonVideoEncodeArgs(output),
  ];
}

export function buildStudioAudioMergeArgs({ sourcePaths, outputPath, params = {} } = {}) {
  const sources = validateSourcePaths(sourcePaths, "Audio merge input", 2);
  const output = validateOutputPath(outputPath, "Merged audio output");
  const mode = params.mode === "concat" ? "concat" : "mix";
  const args = ["-y"];
  sources.forEach((source) => args.push("-i", source));
  const inputs = sources.map((_, index) => `[${index}:a:0]`).join("");
  const filter = mode === "concat"
    ? `${inputs}concat=n=${sources.length}:v=0:a=1[aout]`
    : `${inputs}amix=inputs=${sources.length}:duration=longest:normalize=0[aout]`;
  args.push("-filter_complex", filter, "-map", "[aout]", ...commonAudioEncodeArgs(output));
  return args;
}

export function buildStudioAudioFilterArgs({ sourcePath, outputPath, filter } = {}) {
  const source = validateSourcePath(sourcePath, "Audio filter input");
  const output = validateOutputPath(outputPath, "Audio filter output");
  const audioFilter = asString(filter);
  if (!audioFilter) {
    throw new Error("Audio filter command is missing an FFmpeg filter.");
  }
  return ["-y", "-i", source, "-vn", "-af", audioFilter, ...commonAudioEncodeArgs(output)];
}

export function buildStudioExtractFramesArgs({ sourcePath, outputFolder, params = {} } = {}) {
  const source = validateSourcePath(sourcePath, "Frame extraction input");
  const folder = validateOutputPath(outputFolder, "Frame extraction output folder");
  const format = params.format === "jpg" ? "jpg" : "png";
  const fps = numberParam(params.fps, 1, 0.1, 60);
  return ["-y", "-i", source, "-vf", `fps=${fixed(fps)}`, pathSafeFramePattern(folder, format)];
}

function pathSafeFramePattern(outputFolder, format) {
  return `${outputFolder.replace(/\/+$/, "")}/frame-%05d.${format}`;
}

export function buildStudioSplitArgs({ sourcePath, outputFolder, params = {} } = {}) {
  const source = validateSourcePath(sourcePath, "Video split input");
  const folder = validateOutputPath(outputFolder, "Video split output folder");
  const segmentSeconds = Math.round(numberParam(params.segmentSeconds, 5, 1, 120));
  return [
    "-y",
    "-i",
    source,
    "-map",
    "0",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "18",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-f",
    "segment",
    "-reset_timestamps",
    "1",
    "-segment_time",
    String(segmentSeconds),
    pathSafeSegmentPattern(folder),
  ];
}

function pathSafeSegmentPattern(outputFolder) {
  return `${outputFolder.replace(/\/+$/, "")}/segment-%03d.mp4`;
}

export function buildStudioBlendArgs({ sourcePaths, outputPath, params = {} } = {}) {
  const sources = validateSourcePaths(sourcePaths, "Blend input", 2).slice(0, 2);
  const output = validateOutputPath(outputPath, "Blend output");
  const mode = ["screen", "multiply", "overlay"].includes(params.mode) ? params.mode : "overlay";
  return [
    "-y",
    "-i",
    sources[0],
    "-i",
    sources[1],
    "-filter_complex",
    `[1:v]scale=iw:ih[blendb];[0:v][blendb]blend=all_mode=${mode}:shortest=1[vout]`,
    "-map",
    "[vout]",
    "-map",
    "0:a?",
    ...commonVideoEncodeArgs(output),
  ];
}

export function buildStudioInterleaveArgs({ sourcePaths, outputPath } = {}) {
  const sources = validateSourcePaths(sourcePaths, "Interleave input", 2);
  const output = validateOutputPath(outputPath, "Interleave output");
  const args = ["-y"];
  sources.forEach((source) => args.push("-i", source));
  const inputs = sources.map((_, index) => `[${index}:v:0]`).join("");
  args.push(
    "-filter_complex",
    `${inputs}interleave=nb_inputs=${sources.length}[vout]`,
    "-map",
    "[vout]",
    ...commonVideoEncodeArgs(output, { includeAudio: false }),
  );
  return args;
}

export function buildStudioVideoFilterArgs({
  sourcePath,
  outputPath,
  videoFilter,
  audioFilter,
  filterComplex,
  mapVideo = "0:v:0",
  mapAudio = "0:a?",
  includeAudio = true,
} = {}) {
  const source = validateSourcePath(sourcePath, "Video filter input");
  const output = validateOutputPath(outputPath, "Video filter output");
  const args = ["-y", "-i", source];
  if (filterComplex) {
    args.push("-filter_complex", filterComplex, "-map", mapVideo);
  } else if (videoFilter) {
    args.push("-vf", videoFilter, "-map", mapVideo);
  } else {
    args.push("-map", mapVideo);
  }
  if (includeAudio) {
    args.push("-map", mapAudio);
    if (audioFilter) {
      args.push("-af", audioFilter);
    }
  }
  args.push(...commonVideoEncodeArgs(output, { includeAudio }));
  return args;
}

export function buildStudioFrameGridArgs({ sourcePath, outputPath, params = {} } = {}) {
  const source = validateSourcePath(sourcePath, "Frame grid input");
  const output = validateOutputPath(outputPath, "Frame grid output");
  const rows = Math.round(numberParam(params.rows, 3, 1, 12));
  const columns = Math.round(numberParam(params.columns, 3, 1, 12));
  const gap = Math.round(numberParam(params.gap, 8, 0, 64));
  const background = normalizeColor(params.backgroundColor ?? "#000000");
  const frameCount = rows * columns;
  return [
    "-y",
    "-i",
    source,
    "-vf",
    `select='not(mod(n\\,${frameCount}))',scale=320:-1,tile=${columns}x${rows}:padding=${gap}:margin=${gap}:color=${background}`,
    "-frames:v",
    "1",
    output,
  ];
}

export function buildStudioWatermarkArgs({ sourcePath, watermarkPath, outputPath, params = {} } = {}) {
  const source = validateSourcePath(sourcePath, "Watermark video input");
  const watermark = validateSourcePath(watermarkPath, "Watermark image input");
  const output = validateOutputPath(outputPath, "Watermark output");
  const opacity = numberParam(params.opacity, 0.75, 0, 1);
  const text = asString(params.text);
  const textFilter = text ? `,drawtext=text='${escapeDrawtext(text)}':x=(w-text_w)/2:y=h-th-48:fontcolor=white@${fixed(opacity)}:fontsize=48:box=1:boxcolor=black@0.35` : "";
  return [
    "-y",
    "-i",
    source,
    "-i",
    watermark,
    "-filter_complex",
    `[1:v]format=rgba,colorchannelmixer=aa=${fixed(opacity)}[wm];[0:v][wm]overlay=x=(W-w)/2:y=H-h-48${textFilter}[vout]`,
    "-map",
    "[vout]",
    "-map",
    "0:a?",
    ...commonVideoEncodeArgs(output),
  ];
}

function escapeDrawtext(value) {
  return String(value).replace(/[\\':]/g, "\\$&");
}

export function buildStudioAudioSeparateArgs({ sourcePath, outputPath } = {}) {
  const source = validateSourcePath(sourcePath, "Audio extraction input");
  const output = validateOutputPath(outputPath, "Audio extraction output");
  return ["-y", "-i", source, "-vn", "-map", "0:a:0", ...commonAudioEncodeArgs(output)];
}

export function buildStudioImageTransformArgs({ sourcePath, outputPath, actionId, params = {} } = {}) {
  const source = validateSourcePath(sourcePath, "Image transform input");
  const output = validateOutputPath(outputPath, "Image transform output");
  const filters = [];

  switch (actionId) {
    case "image.color-grade": {
      const brightness = numberParam(params.brightness, 0, -100, 100) / 100;
      const contrast = 1 + numberParam(params.contrast, 0, -100, 100) / 100;
      const saturation = 1 + numberParam(params.saturation, 0, -100, 100) / 100;
      filters.push(`eq=brightness=${fixed(brightness)}:contrast=${fixed(contrast)}:saturation=${fixed(saturation)}`);
      break;
    }
    case "image.color-key": {
      const target = normalizeColor(params.targetColor ?? "#00ff00");
      const tolerance = numberParam(params.tolerance, 32, 0, 255) / 255;
      const softness = numberParam(params.edgeSoftness, 4, 0, 64) / 255;
      const mode = asString(params.mode) ?? "remove";
      const keyFilter = `colorkey=${target}:${fixed(tolerance)}:${fixed(softness)}`;
      if (mode === "isolate") {
        filters.push(keyFilter, "alphaextract");
      } else {
        filters.push(keyFilter);
      }
      break;
    }
    case "image.color-filter": {
      const filter = asString(params.filter) ?? "cinematic";
      if (filter === "grayscale") filters.push("format=gray");
      else if (filter === "sepia") filters.push("colorchannelmixer=.393:.769:.189:0:.349:.686:.168:0:.272:.534:.131");
      else if (filter === "invert") filters.push("negate");
      else filters.push("eq=contrast=1.080:saturation=1.150");
      break;
    }
    case "image.color-tint": {
      const amount = numberParam(params.amount, 0.35, 0, 1);
      const color = normalizeHexColor(params.tintColor, "f97316");
      filters.push(`colorize=hue=${parseInt(color.slice(0, 2), 16)}:saturation=${fixed(amount)}:lightness=0.000:mix=${fixed(amount)}`);
      break;
    }
    case "image.blur": {
      const amount = numberParam(params.amount, 8, 0, 64);
      filters.push(`gblur=sigma=${fixed(amount)}`);
      break;
    }
    case "image.rotate": {
      const radians = degreesToRadians(params.angle ?? 90);
      const expand = params.expandCanvas !== false;
      filters.push(expand
        ? `rotate=${fixed(radians)}:ow=rotw(iw):oh=roth(ih):fillcolor=black@0`
        : `rotate=${fixed(radians)}:fillcolor=black@0`);
      break;
    }
    case "image.flip": {
      const axis = asString(params.axis) ?? "horizontal";
      if (axis === "vertical") filters.push("vflip");
      else if (axis === "both") filters.push("hflip", "vflip");
      else filters.push("hflip");
      break;
    }
    case "image.change-aspect-ratio": {
      const { width, height } = parseAspectRatio(params.aspectRatio);
      const mode = asString(params.mode) ?? "pad";
      if (mode === "crop") {
        filters.push(`crop='if(gt(a,${width}/${height}),ih*${width}/${height},iw)':'if(gt(a,${width}/${height}),ih,iw*${height}/${width})'`);
      } else {
        filters.push(`scale='if(gt(a,${width}/${height}),iw,-1)':'if(gt(a,${width}/${height}),-1,ih)',pad='if(gt(a,${width}/${height}),iw,ih*${width}/${height})':'if(gt(a,${width}/${height}),iw*${height}/${width},ih)':(ow-iw)/2:(oh-ih)/2:black`);
      }
      break;
    }
    case "image.sketch":
      filters.push("format=gray,edgedetect=mode=colormix:high=0.200:low=0.100");
      break;
    case "image.stereo": {
      const disparity = Math.round(numberParam(params.disparity, 24, 0, 128));
      filters.push(`split[left][right];[right]crop=iw-${disparity}:ih:${disparity}:0,pad=iw+${disparity}:ih:0:0:black[rightshift];[left][rightshift]hstack`);
      break;
    }
    case "image.panorama":
      filters.push("scale=2048:1024:force_original_aspect_ratio=increase,crop=2048:1024");
      break;
    default:
      throw new Error(`${actionId} is not a supported local image transform.`);
  }

  const filterOption = filters.join(",").includes(";") ? "-filter_complex" : "-vf";
  return ["-y", "-i", source, filterOption, filters.join(","), "-frames:v", "1", output];
}

export function collectTimelineSourcePaths(timeline = {}) {
  const visualTracks = Array.isArray(timeline.visualTracks) ? timeline.visualTracks : [];
  const audioTracks = Array.isArray(timeline.audioTracks) ? timeline.audioTracks : [];
  return [...visualTracks, ...audioTracks]
    .map((track) => asString(track?.sourcePath))
    .filter(Boolean);
}

export function getTimelineDurationSeconds(timeline = {}) {
  return Math.max(0.001, asFiniteNumber(timeline?.composition?.durationMs, 1000) / 1000);
}

export function validateTimelineRenderPlan(timeline = {}) {
  const composition = timeline.composition ?? {};
  const width = positiveNumber(composition.width);
  const height = positiveNumber(composition.height);
  const fps = positiveNumber(composition.fps, 30);
  const duration = positiveNumber(composition.durationMs, 1000);
  const visualTracks = Array.isArray(timeline.visualTracks) ? timeline.visualTracks : [];
  const audioTracks = Array.isArray(timeline.audioTracks) ? timeline.audioTracks : [];
  const outputPath = asString(timeline.exportSettings?.outputPath);

  if (!outputPath) {
    throw new Error("Missing timeline output path.");
  }
  if (timeline.exportSettings?.format && timeline.exportSettings.format !== "mp4") {
    throw new Error("Local timeline export currently supports MP4 output.");
  }
  if (!Number.isFinite(width) || !Number.isFinite(height) || !Number.isFinite(fps) || !Number.isFinite(duration)) {
    throw new Error("Invalid timeline composition settings.");
  }
  if (visualTracks.length === 0) {
    throw new Error("Add at least one visual clip before rendering the timeline.");
  }

  for (const track of visualTracks) {
    if (!["video", "image", "text", "element"].includes(track?.type)) {
      throw new Error(`Timeline clip "${track?.name ?? track?.id ?? "Untitled"}" has an unsupported media type.`);
    }
    if (track?.type === "text") {
      if (!textForTrack(track).trim()) {
        throw new Error(`Timeline text clip "${track?.name ?? track?.id ?? "Untitled"}" is missing text.`);
      }
    } else if (track?.type === "element") {
      if (!track.element || typeof track.element !== "object") {
        throw new Error(`Timeline element clip "${track?.name ?? track?.id ?? "Untitled"}" is missing element metadata.`);
      }
    } else {
      validateSourcePath(track.sourcePath, `Timeline clip "${track?.name ?? track?.id ?? "Untitled"}"`);
    }
    if (asFiniteNumber(track?.playbackRate, 1) <= 0) {
      throw new Error(`Timeline clip "${track?.name ?? track?.id ?? "Untitled"}" uses an invalid playback rate.`);
    }
    validateSupportedVisualKeyframes(track, `Timeline clip "${track?.name ?? track?.id ?? "Untitled"}"`);
    validateEditorEffects(track.effects, `Timeline clip "${track?.name ?? track?.id ?? "Untitled"}"`);
    validateEditorMasks(track.masks, `Timeline clip "${track?.name ?? track?.id ?? "Untitled"}"`);
  }

  for (const track of audioTracks) {
    validateSourcePath(track.sourcePath, `Audio track "${track?.name ?? track?.id ?? "Untitled"}"`);
    if (asFiniteNumber(track?.playbackRate, 1) <= 0) {
      throw new Error(`Audio track "${track?.name ?? track?.id ?? "Untitled"}" uses an invalid playback rate.`);
    }
    validateSupportedAudioKeyframes(track, `Audio track "${track?.name ?? track?.id ?? "Untitled"}"`);
  }

  return true;
}

function buildVisualFilters(timeline, visualLayers) {
  const { width, height } = timeline.composition;
  const filters = [`[0:v]format=rgba[base0]`];
  let previous = "base0";

  visualLayers.forEach(({ track, inputIndex }, index) => {
    const start = startMs(track) / 1000;
    const end = (startMs(track) + durationMs(track)) / 1000;
    const prepared = `visual${index}`;
    const next = index === visualLayers.length - 1 ? "vout" : `base${index + 1}`;

    if (track?.type === "text") {
      filters.push(...buildTextVisualFilters({ track, previous, next, prepared, composition: timeline.composition }));
      previous = next;
      return;
    }

    if (track?.type === "element") {
      filters.push(...buildGraphicElementFilters({ track, previous, next, prepared, composition: timeline.composition }));
      previous = next;
      return;
    }

    if (!Number.isFinite(inputIndex)) {
      throw new Error(`Timeline clip "${track?.name ?? track?.id ?? "Untitled"}" is missing an FFmpeg input.`);
    }

    const scalePlan = scalePlanForTrack(track, width, height);
    const opacityFilter = opacityFilterForTrack(track);
    const effectFilters = buildEditorEffectFilters(track.effects);
    const maskFilters = buildEditorMaskFilters(track.masks);
    const rotationFilter = rotationFilterForTrack(track, scalePlan.width, scalePlan.height);
    const editorEffects = effectFilters.length ? `,${effectFilters.join(",")}` : "";
    const editorMasks = maskFilters.length ? `,${maskFilters.join(",")}` : "";
    const x = appendCenteredOffset("(W-w)/2", positionExpressionForTrack(track, "x"));
    const y = appendCenteredOffset("(H-h)/2", positionExpressionForTrack(track, "y"));
    const timingFilter = retimedVideoSetpts(track, start);

    filters.push(
      `[${inputIndex}:v]${timingFilter},${scalePlan.filter},format=rgba${editorEffects}${editorMasks}${rotationFilter}${opacityFilter}[${prepared}]`,
    );
    filters.push(
      `[${previous}][${prepared}]overlay=x=${x}:y=${y}:enable='between(t,${fixed(start)},${fixed(end)})'[${next}]`,
    );
    previous = next;
  });

  return filters;
}

function buildAudioFilters(audioInputs) {
  if (audioInputs.length === 0) return [];

  const filters = audioInputs.map(({ track, inputIndex }, index) => {
    const duration = durationMs(track) / 1000;
    const sourceDuration = sourceDurationMs(track) / 1000;
    const start = startMs(track);
    const rate = playbackRateForTrack(track);
    const volumeExpression = audioVolumeExpressionForTrack(track);
    const volumeFilter = volumeExpression.startsWith("if(") ? `volume='${volumeExpression}':eval=frame` : `volume=${volumeExpression}`;
    const chain = [
      `[${inputIndex}:a]atrim=0:${fixed(sourceDuration)}`,
      "asetpts=PTS-STARTPTS",
      ...atempoFilters(rate),
      volumeFilter,
    ];
    const fadeInSeconds = Math.min(duration, asFiniteNumber(track.fadeInMs) / 1000);
    const fadeOutSeconds = Math.min(duration, asFiniteNumber(track.fadeOutMs) / 1000);
    if (fadeInSeconds > 0) {
      chain.push(`afade=t=in:st=0:d=${fixed(fadeInSeconds)}`);
    }
    if (fadeOutSeconds > 0) {
      chain.push(`afade=t=out:st=${fixed(Math.max(0, duration - fadeOutSeconds))}:d=${fixed(fadeOutSeconds)}`);
    }
    chain.push(`adelay=${start}|${start}[audio${index}]`);
    return chain.join(",");
  });

  filters.push(`${audioInputs.map((_, index) => `[audio${index}]`).join("")}amix=inputs=${audioInputs.length}:duration=longest:normalize=0[aout]`);
  return filters;
}

export function buildRenderTimelineArgs({ timeline, outputPath }) {
  validateTimelineRenderPlan(timeline);

  const composition = timeline.composition;
  const duration = getTimelineDurationSeconds(timeline);
  const exportSettings = timeline.exportSettings ?? {};
  const visualTracks = [...timeline.visualTracks].sort((a, b) => (a.layer ?? 0) - (b.layer ?? 0) || startMs(a) - startMs(b));
  const audioTracks = (Array.isArray(timeline.audioTracks) ? timeline.audioTracks : [])
    .filter((track) => exportSettings.includeAudio !== false && !track.muted && durationMs(track) > 0);

  const args = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=${normalizeColor(composition.backgroundColor)}:s=${positiveNumber(composition.width)}x${positiveNumber(composition.height)}:r=${positiveNumber(composition.fps, 30)}:d=${fixed(duration)}`,
  ];

  const visualLayers = [];
  const audioInputs = [];
  let inputIndex = 1;

  for (const track of visualTracks) {
    if (track.type === "text" || track.type === "element") {
      visualLayers.push({ track });
    } else {
      args.push(...visualInputArgs(track));
      visualLayers.push({ track, inputIndex });
      inputIndex += 1;
    }
  }

  for (const track of audioTracks) {
    args.push(...audioInputArgs(track));
    audioInputs.push({ track, inputIndex });
    inputIndex += 1;
  }

  const filterGraph = [
    ...buildVisualFilters(timeline, visualLayers),
    ...buildAudioFilters(audioInputs),
  ].join(";");

  args.push("-filter_complex", filterGraph);
  args.push("-map", "[vout]");
  if (audioInputs.length > 0) {
    args.push("-map", "[aout]");
  }
  args.push(
    "-t",
    formatSecondsForFfmpeg(duration),
    "-r",
    String(positiveNumber(composition.fps, 30)),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    qualityToCrf(exportSettings.quality),
    "-pix_fmt",
    "yuv420p",
  );
  if (audioInputs.length > 0) {
    args.push("-c:a", "aac", "-b:a", "192k");
  }
  if (exportSettings.fastStart !== false) {
    args.push("-movflags", "+faststart");
  }
  args.push(outputPath ?? exportSettings.outputPath);
  return args;
}
