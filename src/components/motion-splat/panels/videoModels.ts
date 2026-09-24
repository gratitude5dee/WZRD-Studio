import { MOTION_SPLAT_VIDEO_MODELS } from '@/lib/motion-splat/constants';
import { getDefaultImageToVideoModel, getModelsByType, type StudioModel } from '@/lib/studio-model-constants';

/**
 * The image-to-video models the motion-splat edge function accepts, default
 * first then cheapest first. Offering anything outside that table would fail
 * the build with "Unsupported image-to-video model" after the user picked it.
 */
export function imageToVideoModels(): StudioModel[] {
  const models = getModelsByType('video').filter(
    (model) => model.workflowType === 'image-to-video' && model.id in MOTION_SPLAT_VIDEO_MODELS,
  );
  const defaultId = getDefaultImageToVideoModel();
  return [...models].sort((a, b) => (a.id === defaultId ? -1 : b.id === defaultId ? 1 : a.credits - b.credits));
}
