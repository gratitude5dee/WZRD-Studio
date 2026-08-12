import { resolveRequestIdentity } from '../_shared/auth.ts';
import { corsHeaders } from '../_shared/response.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const identity = await resolveRequestIdentity(req.headers);
    const supabase = identity.client;
    const user = { id: identity.userId };

    const { projectId } = await req.json();

    if (!projectId) {
      throw new Error('Project ID is required');
    }

    console.log(`Loading state for project ${projectId}`);

    // Verify user owns the project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .eq('user_id', user.id)
      .single();

    if (projectError || !project) {
      throw new Error('Project not found or access denied');
    }

    // Load blocks
    const { data: blocksData, error: blocksError } = await supabase
      .from('studio_blocks')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', user.id);

    if (blocksError) {
      console.error('Error loading blocks:', blocksError);
      throw blocksError;
    }

    // Transform blocks to frontend format
    const blocks = (blocksData || []).map((block: any) => ({
      id: block.id,
      type: block.block_type,
      position: {
        x: Number(block.position_x),
        y: Number(block.position_y)
      },
      initialData: block.generated_output_url ? {
        prompt: block.prompt,
        imageUrl: block.generated_output_url,
        generationTime: block.generation_metadata?.generationTime,
        aspectRatio: block.generation_metadata?.aspectRatio
      } : undefined,
      selectedModel: block.selected_model
    }));

    // Load canvas state
    const { data: canvasData, error: canvasError } = await supabase
      .from('canvas_state')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (canvasError) {
      console.error('Error loading canvas state:', canvasError);
    }

    const canvasState = canvasData ? {
      viewport: canvasData.viewport_data || { x: 0, y: 0, zoom: 1 },
      settings: canvasData.canvas_settings || { showGrid: true }
    } : null;

    console.log(`Successfully loaded state for project ${projectId}:`, {
      blockCount: blocks.length,
      hasCanvasState: !!canvasState
    });

    return new Response(
      JSON.stringify({
        success: true,
        blocks,
        canvasState
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in studio-load-state:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to load state';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});