// Single reviewable "Project brief": the same object the plugin fills in one
// round-trip and the wizard edits here (look + cast + voice).
import { useCallback, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { supabaseService } from '@/services/supabaseService';
import { cn } from '@/lib/utils';
import { useVoiceSelection } from '@/voice/VoiceSelectionContext';
import { useProjectContext } from './ProjectContext';
import { CastTab } from './CastTab';
import { StyleReferenceUploader } from './StyleReferenceUploader';
import { VoiceOverSelector } from './VoiceOverSelector';
import {
  ASPECT_RATIOS,
  DEFAULT_ASPECT_RATIO,
  DEFAULT_VIDEO_STYLE,
  VIDEO_STYLES,
  getFeaturedVideoStyles,
  isAspectRatio,
  isVideoStyle,
  type AspectRatioOption,
  type VideoStyleOption,
} from './videoStyles';
import type { Character, ProjectData } from './types';

interface ProjectBriefTabProps {
  projectData: ProjectData;
  updateProjectData: (data: Partial<ProjectData>) => void;
}

interface BriefScene {
  id: string;
  title?: string;
  scene_number: number;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error';
}

const ratioBoxClass = (ratio: AspectRatioOption) =>
  ratio === '16:9' ? 'w-8 h-5' : ratio === '1:1' ? 'w-5 h-5' : 'w-4 h-7';

const ProjectBriefTab = ({ projectData, updateProjectData }: ProjectBriefTabProps) => {
  const { projectId, generationCompletedSignal } = useProjectContext();
  const { isSelected, selectTarget } = useVoiceSelection();

  const selectedAspectRatio: AspectRatioOption = isAspectRatio(projectData.aspectRatio)
    ? projectData.aspectRatio
    : DEFAULT_ASPECT_RATIO;
  const selectedVideoStyle: VideoStyleOption = isVideoStyle(projectData.videoStyle)
    ? projectData.videoStyle
    : DEFAULT_VIDEO_STYLE;

  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<BriefScene[]>([]);
  const [showAllStyles, setShowAllStyles] = useState(false);

  // Persist normalized look defaults so the wizard row matches setup_project's.
  useEffect(() => {
    if (
      projectData.aspectRatio !== selectedAspectRatio ||
      projectData.videoStyle !== selectedVideoStyle
    ) {
      updateProjectData({
        aspectRatio: selectedAspectRatio,
        videoStyle: selectedVideoStyle,
      });
    }
  }, [
    projectData.aspectRatio,
    projectData.videoStyle,
    selectedAspectRatio,
    selectedVideoStyle,
    updateProjectData,
  ]);

  useEffect(() => {
    if (!projectId) {
      setCharacters([]);
      setScenes([]);
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const [loadedCharacters, loadedScenes] = await Promise.all([
          supabaseService.characters.listByProject(projectId),
          supabaseService.scenes.listByProject(projectId),
        ]);
        if (cancelled) return;
        setCharacters(loadedCharacters ?? []);
        setScenes(
          (loadedScenes ?? []).map((scene) => ({
            id: scene.id,
            title: scene.title ?? undefined,
            scene_number: scene.scene_number,
          })),
        );
      } catch (error) {
        if (cancelled) return;
        toast.error(`Failed to load cast: ${getErrorMessage(error)}`);
      }
    };

    load();

    const channel = supabase
      .channel(`characters-${projectId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'characters',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const updated = payload.new as Character;
          setCharacters((prev) =>
            prev.map((char) => (char.id === updated.id ? { ...char, ...updated } : char)),
          );
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [projectId, generationCompletedSignal]);

  const handleAddCharacter = useCallback(
    async (name: string, description: string) => {
      if (!projectId) {
        toast.error('Please save the project first');
        return;
      }
      try {
        const characterId = await supabaseService.characters.create({
          project_id: projectId,
          name,
          description: description || 'A new character.',
        });
        setCharacters((prev) => [
          ...prev,
          {
            id: characterId,
            project_id: projectId,
            name,
            description: description || 'A new character.',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ]);
        toast.success(`Added ${name}`);
      } catch (error) {
        toast.error(`Failed to add character: ${getErrorMessage(error)}`);
      }
    },
    [projectId],
  );

  const handleDeleteCharacter = useCallback(async (characterId: string) => {
    try {
      await supabaseService.characters.delete(characterId);
      setCharacters((prev) => prev.filter((char) => char.id !== characterId));
      toast.success('Character deleted');
    } catch (error) {
      toast.error(`Failed to delete character: ${getErrorMessage(error)}`);
    }
  }, []);

  // Rejects on failure so CastTab can surface it inline and report it upstream.
  const handleGenerateAllImages = useCallback(async () => {
    for (const character of characters) {
      const { error } = await supabase.functions.invoke('generate-character-image', {
        body: {
          character_id: character.id,
          style_reference_url: projectData.styleReferenceUrl,
        },
      });
      if (error) {
        throw new Error(`${character.name}: ${error.message}`);
      }
    }
  }, [characters, projectData.styleReferenceUrl]);

  const handleStyleReferenceChange = (url: string | null, assetId: string | null) => {
    updateProjectData({
      styleReferenceUrl: url || undefined,
      styleReferenceAssetId: assetId || undefined,
    });
  };

  const handleClearVoiceover = () => {
    updateProjectData({
      addVoiceover: false,
      voiceoverId: undefined,
      voiceoverName: undefined,
      voiceoverPreviewUrl: undefined,
    });
  };

  return (
    <div className="min-h-full flex flex-col md:flex-row">
      {/* Brief: format & look */}
      <div className="w-full md:w-1/2 p-6 border-r border-line-subtle">
        <h2 className="text-2xl font-semibold mb-1">Project brief</h2>
        <p className="text-sm text-muted-foreground mb-6">
          One object the wizard edits and agents can fill in a single call.
        </p>

        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="projectName" className="block text-sm font-medium text-muted-foreground uppercase">
              PROJECT NAME<span className="text-status-danger">*</span>
            </Label>
            <Input
              id="projectName"
              value={projectData.title || ''}
              onChange={(e) => updateProjectData({ title: e.target.value })}
              placeholder="Enter your project name"
              className="w-full bg-surface-raised border-line-subtle rounded text-white"
            />
          </div>

          <div className="space-y-2">
            <Label className="block text-sm font-medium text-muted-foreground uppercase">
              ASPECT RATIO
            </Label>
            <div className="grid grid-cols-3 gap-2">
              {ASPECT_RATIOS.map(({ value, label }) => {
                const isActive = selectedAspectRatio === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={isActive}
                    aria-label={`${label} ${value}`}
                    data-testid={`aspect-ratio-${value}`}
                    onClick={() => updateProjectData({ aspectRatio: value })}
                    className={cn(
                      'flex flex-col items-center justify-center h-12 rounded border transition-colors',
                      isActive
                        ? 'bg-accent-ember border-accent-ember text-white'
                        : 'bg-surface-raised border-line-subtle text-muted-foreground hover:border-accent-mineral',
                    )}
                  >
                    <div className={cn('border border-current rounded-sm mb-1', ratioBoxClass(value))} />
                    <span className="text-xs">{value}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="block text-sm font-medium text-muted-foreground uppercase">
                VIDEO STYLE
              </Label>
              <button
                type="button"
                onClick={() => setShowAllStyles(true)}
                className="text-xs text-accent-air flex items-center hover:text-accent-ember transition-colors"
              >
                View All <ChevronRight className="h-3 w-3 ml-1" />
              </button>
            </div>

            <div className="grid grid-cols-4 gap-3">
              {getFeaturedVideoStyles().map((style) => {
                const isActive = selectedVideoStyle === style.value;
                return (
                  <button
                    key={style.value}
                    type="button"
                    aria-pressed={isActive}
                    data-testid={`video-style-${style.value}`}
                    onClick={() => updateProjectData({ videoStyle: style.value })}
                    className={cn(
                      'relative p-1 pb-6 aspect-square rounded border',
                      isActive ? 'border-accent-ember ring-1 ring-accent-ember/30' : 'border-line-subtle',
                    )}
                  >
                    <div className="w-full h-full bg-surface-raised rounded-sm overflow-hidden">
                      <img
                        src={style.thumbnail}
                        alt={`${style.label} style preview`}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span
                      className={cn(
                        'absolute bottom-1 left-0 right-0 text-center text-xs',
                        isActive ? 'text-white' : 'text-muted-foreground',
                      )}
                    >
                      {style.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <Dialog open={showAllStyles} onOpenChange={setShowAllStyles}>
            <DialogContent className="border-line-subtle bg-surface-canvas text-white sm:max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>All Video Styles</DialogTitle>
                <DialogDescription className="text-text-muted">
                  Pick the look every shot in this project is generated in.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
                {VIDEO_STYLES.map((style) => {
                  const isActive = selectedVideoStyle === style.value;
                  return (
                    <button
                      key={style.value}
                      type="button"
                      aria-pressed={isActive}
                      data-testid={`video-style-all-${style.value}`}
                      onClick={() => {
                        updateProjectData({ videoStyle: style.value });
                        setShowAllStyles(false);
                      }}
                      className={cn(
                        'relative p-3 rounded-xl border text-left transition-all',
                        isActive
                          ? 'border-accent-ember bg-accent-ember/10 ring-1 ring-accent-ember/30'
                          : 'border-line-subtle bg-surface-raised hover:border-accent-mineral',
                      )}
                    >
                      <div className="w-full h-20 rounded-lg mb-3 overflow-hidden bg-surface-raised">
                        <img
                          src={style.thumbnail}
                          alt={`${style.label} style preview`}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <p className="font-medium text-sm">{style.label}</p>
                      <p className="text-xs text-muted-foreground mt-1">{style.description}</p>
                    </button>
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>

          {projectId && (
            <StyleReferenceUploader
              projectId={projectId}
              styleReferenceUrl={projectData.styleReferenceUrl}
              onStyleReferenceChange={handleStyleReferenceChange}
            />
          )}

          <div className="space-y-3">
            <VoiceOverSelector
              selectedVoiceId={projectData.voiceoverId}
              selectedVoiceName={projectData.voiceoverName}
              onVoiceSelect={(voiceId, voiceName, previewUrl) =>
                updateProjectData({
                  addVoiceover: true,
                  voiceoverId: voiceId,
                  voiceoverName: voiceName,
                  voiceoverPreviewUrl: previewUrl,
                })
              }
            />
            {projectData.voiceoverId && (
              <Button variant="outline" size="sm" onClick={handleClearVoiceover}>
                Clear voice selection
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="cinematic-inspiration"
              className="block text-sm font-medium text-muted-foreground uppercase"
            >
              CINEMATIC INSPIRATION
            </Label>
            <Textarea
              id="cinematic-inspiration"
              value={projectData.cinematicInspiration || ''}
              onChange={(e) => updateProjectData({ cinematicInspiration: e.target.value })}
              placeholder="E.g., 'Retro, gritty, eclectic, stylish, noir...'"
              className="bg-surface-raised border-line-subtle text-white"
            />
          </div>
        </div>
      </div>

      {/* Brief: cast */}
      <div className="w-full md:w-1/2 p-6">
        <CastTab
          characters={characters}
          scenes={scenes}
          styleReferenceUrl={projectData.styleReferenceUrl}
          onAddCharacter={handleAddCharacter}
          onDeleteCharacter={handleDeleteCharacter}
          onGenerateAllImages={handleGenerateAllImages}
          isCharacterSelected={(character) => isSelected('character', character.id)}
          onSelectCharacter={(character) =>
            selectTarget({
              type: 'character',
              id: character.id,
              label: character.name,
              projectId,
              sourceImageUrl: character.image_url ?? null,
            })
          }
        />
      </div>
    </div>
  );
};

export default ProjectBriefTab;
