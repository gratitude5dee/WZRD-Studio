export function getSplineZoom(width: number, height: number) {
  if (width <= 0 || height <= 0) return 1;

  if (width >= height) {
    // The Spline export's native orthographic frame leaves too much unused
    // desktop stage around the sculpture. Scale only the landscape camera so
    // the artwork carries the hero without clipping its silhouette or copy.
    return Math.min(1.32, Math.max(1.26, 1.26 + Math.max(0, height - 640) * 0.0004));
  }

  // Keep the portrait framing proportional as the stage grows. The exported
  // scene has a wide camera, so this modest zoom makes the sculpture legible
  // while preserving its complete silhouette and the scene copy above it.
  const aspectRatio = height / width;
  return Math.min(1.72, Math.max(1.58, 1.62 + (aspectRatio - 1.25) * 0.16));
}
