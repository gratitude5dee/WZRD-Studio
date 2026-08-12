export interface DocsBlock {
  heading?: string;
  body: string[];
  bullets?: string[];
  code?: { label?: string; text: string };
}

export interface DocsSection {
  id: string;
  title: string;
  navTitle?: string;
  tagline: string;
  description: string;
  group: string;
  blocks: DocsBlock[];
}

export const DOCS_BASE_URL = 'https://studio.wzrd.tech/docs';

export const DOCS_GROUPS = [
  'Get started',
  'Create',
  'Edit & deliver',
  'Distribute',
  'Own & bill',
  'Build on WZRD',
] as const;

export function getDocsSection(id: string): DocsSection | undefined {
  return DOCS_SECTIONS.find((s) => s.id === id);
}

export const DOCS_SECTIONS: DocsSection[] = [
  {
    id: 'overview',
    title: 'What is WZRD Studio?',
    navTitle: 'Introduction',
    tagline: 'A creator operating system: concept → storyboard → generation → edit → delivery, in one place.',
    description:
      'WZRD Studio is an AI creative studio that takes a video project from concept to storyboard to generation to editing to final delivery in one workflow, in the browser or on desktop.',
    group: 'Get started',
    blocks: [
      {
        body: [
          'WZRD Studio takes a project from an idea to a finished video without leaving the app. Every project carries three connected surfaces — Studio (node-based generation), Timeline (storyboard), and Editor (full video editor) — backed by a shared asset library, server-side AI billing, and on-chain IP registration.',
          'It runs in the browser at studio.wzrd.tech and as a macOS desktop app with native FFmpeg export, terminal, and deep-link support.',
        ],
      },
      {
        heading: 'The core loop',
        body: [],
        bullets: [
          'Set up a project: concept, storyline, settings & cast — AI-assisted or from your script.',
          'Storyboard it on the Timeline: scenes, shots, prompts, and per-shot image generation.',
          'Generate in Studio: prompt-to-workflow node graphs for image, video, and audio models.',
          'Edit in the Editor: multi-track timeline, effects, captions, text animations, export.',
          "Deliver: Director's Cut assembles shot videos into a final cut; export runs in the browser or natively on desktop.",
        ],
      },
    ],
  },
  {
    id: 'quickstart',
    title: 'Quickstart',
    tagline: 'Sign in, get credits, create your first project.',
    description:
      'How to start using WZRD Studio: sign in with a wallet or email, understand credits (1 credit = 1 US cent), and create your first project with the four-step setup wizard.',
    group: 'Get started',
    blocks: [
      {
        heading: 'Accounts & sign-in',
        body: [
          'WZRD uses wallet-based auth (Thirdweb in-app wallets, including email/SMS OTP) bridged into a Supabase session. The same account works on web and desktop.',
        ],
      },
      {
        heading: 'Credits',
        body: [
          'All AI generation is billed in credits (1 credit = 1 US cent), deducted server-side against a priced model catalog. Your balance is always visible in the top bar; every generation shows its cost before it runs. Top up from Settings → Billing.',
        ],
      },
      {
        heading: 'Your first project',
        body: [
          'From Home, click New Project to enter the four-step setup wizard: Concept (what you are making — short film, commercial, music video, infotainment, or custom), Storyline (AI-developed or stick-to-script), Settings & Cast (aspect ratio, visual style, voiceover, characters), and Breakdown (scenes and shots). The wizard produces a ready-to-generate storyboard.',
        ],
      },
    ],
  },
  {
    id: 'projects',
    title: 'Home & projects',
    tagline: 'Project library, search, favorites, and bulk management.',
    description:
      'The WZRD Studio Home page: browse projects in grid or table view, search, favorite, and bulk-manage, and open any project into Studio, Timeline, or Editor.',
    group: 'Get started',
    blocks: [
      {
        body: [
          'Home lists all your projects in grid or records-table view with sortable columns, live search, favorites, and bulk selection (multi-delete via the floating selection bar). Each project card opens directly into Studio, Timeline, or Editor.',
        ],
      },
    ],
  },
  {
    id: 'studio',
    title: 'Studio — node-based generation',
    navTitle: 'Studio (node editor)',
    tagline: 'A prompt-to-workflow canvas: describe what you want, get an executable node graph.',
    description:
      'WZRD Studio\u2019s node-based generation canvas: a prompt-to-workflow video agent that plans and wires image, video, and audio model blocks into executable graphs.',
    group: 'Create',
    blocks: [
      {
        body: [
          'Studio is an infinite canvas of connected generation blocks (React Flow). Every block is a model call — image, video, audio, text — with typed inputs and outputs you can wire together.',
        ],
      },
      {
        heading: 'Workflow generator (video agent)',
        body: [
          'Describe the workflow in plain language ("moody portrait, then animate it with a slow push-in") and the generator plans a node graph, shows you the plan, and materializes the nodes wired together. Settings control the planning model, output resolution, and workflow complexity.',
        ],
      },
      {
        heading: 'Blocks & models',
        body: [],
        bullets: [
          'Image blocks: text-to-image and image-editing models (Nano Banana, Seedream, Flux, and more) with aspect-ratio and lens controls.',
          'Video blocks: image-to-video and text-to-video (Seedance, Veo, Kling, and more) with duration and camera controls.',
          'Audio blocks: text-to-speech, sound effects, and music via ElevenLabs.',
          'Every block shows its credit cost up front; runs are queued and observable from the Queue indicator.',
        ],
      },
      {
        heading: 'Graphs are saved state',
        body: [
          'Studio graphs save with the project and can be re-run, shared, or executed headlessly by agents through the MCP server (see Agent plugin).',
        ],
      },
    ],
  },
  {
    id: 'timeline',
    title: 'Timeline — storyboard',
    navTitle: 'Timeline (storyboard)',
    tagline: 'Scenes, shots, prompts, and one-click image generation with continuity.',
    description:
      'The Timeline storyboard in WZRD Studio: scenes, shots, visual prompts, per-shot and per-scene image generation with character and setting continuity, plus Director\u2019s Cut final assembly.',
    group: 'Create',
    blocks: [
      {
        body: [
          'The Timeline view is the storyboard: scenes containing shots, each with a shot type (wide, medium, close-up…), a visual prompt, and a generated frame. Scene descriptions, locations, time of day, weather, and atmosphere feed every shot prompt in that scene.',
        ],
      },
      {
        heading: 'Generation',
        body: [],
        bullets: [
          'Generate Image on a single shot (2 credits) or Generate Images for a whole scene (10 credits).',
          'Auto-generate writes prompts for every shot in a scene from the scene description.',
          'Edit, upscale, or regenerate any frame; character and setting references keep faces and places consistent.',
        ],
      },
      {
        heading: "Director's Cut",
        body: [
          "When shots have videos, Director's Cut concatenates them into a final cut with transitions and delivers a downloadable file — the fastest path from storyboard to finished video.",
        ],
      },
    ],
  },
  {
    id: 'editor',
    title: 'Editor — full video editor',
    navTitle: 'Editor (video editor)',
    tagline: 'Multi-track editing, effects, captions, AI panels, and client-side export.',
    description:
      'The full WZRD Studio video editor: multi-track timeline, effect keyframes, text animations, karaoke captions, AI generation panels, and browser export via WebCodecs (MP4/WebM/GIF) or native FFmpeg on desktop.',
    group: 'Edit & deliver',
    blocks: [
      {
        body: [
          'The Editor is a complete video editor that runs entirely in the browser (and with native acceleration on desktop). Projects auto-save to the cloud and reopen anywhere.',
        ],
      },
      {
        heading: 'Editing',
        body: [],
        bullets: [
          'Multi-track timeline with video, audio, and text tracks; trim, split, move, and layer with full undo/redo.',
          'Live scrubbing preview with effect keyframes that animate in both preview and export.',
          'Transform properties with drag-to-scrub numeric fields (drag the label, arrow keys, Shift for ×10).',
          'Text elements with animation presets — fade, slide, pop, typewriter — rendered identically in preview and export.',
          'Captions: server-side transcription (Whisper) with karaoke word timing that renders in the exported file.',
        ],
      },
      {
        heading: 'Media & AI panels',
        body: [],
        bullets: [
          'Import from disk or from your project assets in Supabase.',
          'AI panels for text-to-image, image-to-video, text-to-speech, and more — billed in credits, server-side.',
          'Media library with folders, search, and drag-to-timeline.',
        ],
      },
      {
        heading: 'Export',
        body: [],
        bullets: [
          'Browser export via WebCodecs: MP4 (H.264) where the encoder is available, with a clearly-labelled WebM fallback otherwise; GIF export included.',
          'Desktop export via native FFmpeg for the fastest, highest-fidelity renders.',
          'Estimated file size, resolution up to 1920×1080, and format shown before you export.',
        ],
      },
    ],
  },
  {
    id: 'kanvas',
    title: 'Kanvas — AI studios',
    navTitle: 'Kanvas (AI studios)',
    tagline: 'Focused studios for image, video, cinema, lipsync, lyrics, and remixing.',
    description:
      'Kanvas is WZRD Studio\u2019s suite of focused AI studios: image, video, cinema, lipsync, lyric-video, and remix tools for direct generation without a node graph.',
    group: 'Create',
    blocks: [
      {
        body: [
          'Kanvas is a suite of single-purpose AI studios when you want a focused tool instead of a node graph:',
        ],
        bullets: [
          'Image, Video, and Cinema studios for direct generation with model pickers.',
          'Lipsync studio for talking-head and performance sync.',
          'Lyrics: transcribe a track and generate lyric videos from templates.',
          'Remix: template-driven video remixing with job tracking.',
        ],
      },
    ],
  },
  {
    id: 'clip-studio',
    title: 'Clip Studio, Sourcify & Postz',
    tagline: 'Find viral clips, source content, and schedule posts across channels.',
    description:
      'WZRD Studio distribution tools: Clip Studio finds viral moments with AI scoring, Sourcify sources external content, and Postz schedules posts across channels with a multi-channel composer and calendar.',
    group: 'Distribute',
    blocks: [
      {
        heading: 'Clip Studio (Clipper)',
        body: [
          'Analyze long-form video to find the most clip-worthy moments with AI scoring, then cut and brand them for short-form.',
        ],
      },
      {
        heading: 'Sourcify',
        body: ['Source and analyze content from external platforms to feed your clip pipeline.'],
      },
      {
        heading: 'Postz (social scheduler)',
        body: [],
        bullets: [
          'OAuth channel connect (returns to the desktop app via deep-link).',
          'Multi-channel composer with per-channel validation.',
          'Calendar with drag-to-reschedule and state filters (Draft / Queue / Publishing / Published / Error).',
          'Attach media straight from project assets.',
        ],
      },
    ],
  },
  {
    id: 'ip-vault',
    title: 'IP Vault',
    tagline: 'Register and manage your intellectual property on-chain.',
    description:
      'The IP Vault registers creative assets as IP on Story Protocol, giving each asset verifiable on-chain provenance and licensing terms.',
    group: 'Own & bill',
    blocks: [
      {
        body: [
          'The IP Vault stores your creative assets and registers them as IP on Story Protocol, giving each asset verifiable on-chain provenance and licensing terms. Browse, search, and manage everything you own from one gallery.',
        ],
      },
    ],
  },
  {
    id: 'credits-billing',
    title: 'Credits & billing',
    tagline: 'Transparent, server-side, per-generation pricing.',
    description:
      'How WZRD Studio credits work: 1 credit = 1 US cent, every AI call priced server-side from a model catalog, credits held on start and settled on completion, with strict pricing and no provider keys in the browser.',
    group: 'Own & bill',
    blocks: [
      {
        body: [
          'Every AI call is priced from a server-side model catalog (1 credit = 1 US cent). Credits are held when a generation starts and settled when it completes — queued jobs that fail or are cancelled release their hold. Your balance, history, and top-ups live in Settings → Billing.',
        ],
        bullets: [
          'Strict pricing: a generation never silently substitutes a different model or price.',
          'Rate-priced models (e.g. per-second TTS) bill from the actual payload.',
          'API keys for AI providers never ship to the browser — all provider calls run server-side.',
        ],
      },
    ],
  },
  {
    id: 'agent-plugin',
    title: 'Agent plugin & MCP',
    tagline: 'Drive WZRD from Claude Code, Codex, and other agent harnesses.',
    description:
      'WZRD Studio exposes its functionality to AI agents through an MCP server and Agent Plugins package, so Claude Code, Codex, Hermes, OpenClaw, and other harnesses can set up projects, storyboard, and generate.',
    group: 'Build on WZRD',
    blocks: [
      {
        body: [
          'WZRD exposes its functionality to AI agents through an MCP (Model Context Protocol) server and an Agent Plugins-format package, so you can set up projects, iterate storyboards, and trigger generation from inside Claude Code, Codex, Hermes, OpenClaw, and any Agent Skills host.',
        ],
        code: {
          label: 'MCP server (Streamable HTTP)',
          text: 'https://ixkkrousepsiorwlaycp.supabase.co/functions/v1/mcp-server',
        },
        bullets: [
          'Tools include list_models, get_credits, create_project, get_timeline, run_studio_graph, and create_checkout_session, with the full storyboarding surface on the roadmap.',
          'Agent-agnostic skills ship in the repo under agent-skills/, with per-harness configs (.claude/, .codex/, .openclaw/, .hermes/).',
          'Discovery endpoint: /.well-known/agents.json.',
        ],
      },
    ],
  },
  {
    id: 'desktop',
    title: 'Desktop app (macOS)',
    navTitle: 'Desktop app',
    tagline: 'Native FFmpeg export, terminal, and deep links.',
    description:
      'The WZRD Studio macOS desktop app adds native FFmpeg export, an integrated terminal and local MCP server, wzrd:// deep links, and local file access for large media.',
    group: 'Build on WZRD',
    blocks: [
      {
        body: [
          'The desktop build wraps the same app in Electron and adds what browsers cannot do:',
        ],
        bullets: [
          'Native FFmpeg export pipeline for the Editor.',
          'Integrated PTY terminal and local MCP server for agent workflows.',
          'wzrd:// deep links (auth callback, OAuth returns).',
          'Local file access for large media without upload.',
        ],
      },
      {
        heading: 'Install',
        body: [
          'Download the DMG, drag WZRD Studio.app to Applications, then right-click → Open on first launch (the build is currently unsigned).',
        ],
      },
    ],
  },
];
