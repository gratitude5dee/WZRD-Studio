import { getDefaultImageToVideoModel, getModelsByType, type StudioModel } from '@/lib/studio-model-constants';

/** fal image-to-video models, default first then cheapest first. */
export function imageToVideoModels(): StudioModel[] {
  const models = getModelsByType('video').filter((model) => model.workflowType === 'image-to-video' && model.provider === 'fal-ai');
  const defaultId = getDefaultImageToVideoModel();
  return [...models].sort((a, b) => (a.id === defaultId ? -1 : b.id === defaultId ? 1 : a.credits - b.credits));
}
