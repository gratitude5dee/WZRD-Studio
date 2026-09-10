export function getSplineZoom(width: number, height: number) {
  if (width <= 0 || height <= 0 || width >= height) return 1;

  // Keep the portrait framing proportional as the stage grows. The exported
  // scene has a wide camera, so this modest zoom makes the sculpture legible
  // while preserving its complete silhouette and the scene copy above it.
  const aspectRatio = height / width;
  return Math.min(1.72, Math.max(1.58, 1.62 + (aspectRatio - 1.25) * 0.16));
}
