import { describe, expect, it } from "vitest";

import {
  buildExtractWaveformPcmArgs,
  buildRenderPreviewProxyArgs,
  buildRenderTimelineArgs,
  buildStudioAudioFilterArgs,
  buildStudioAudioMergeArgs,
  buildStudioAudioSeparateArgs,
  buildStudioConcatArgs,
  buildStudioFrameGridArgs,
  buildStudioImageTransformArgs,
  buildStudioMergeAudioVideoArgs,
  buildStudioSplitArgs,
  buildStudioVideoFilterArgs,
  buildStudioWatermarkArgs,
  collectTimelineSourcePaths,
} from "./media-ffmpeg-commands.js";

const timeline = {
  composition: {
    width: 1920,
    height: 1080,
    fps: 30,
    durationMs: 5000,
    backgroundColor: "#000000",
  },
  visualTracks: [
    {
      id: "clip-1",
      type: "video",
      name: "Clip",
      sourcePath: "/Users/me/source.mp4",
      startMs: 0,
      durationMs: 5000,
      layer: 0,
      transform: {
        position: { x: 0, y: 0 },
        scale: { x: 1, y: 1 },
        rotation: 0,
        opacity: 1,
      },
      opacity: 1,
    },
  ],
  audioTracks: [
    {
      id: "audio-1",
      name: "Audio",
      sourcePath: "/Users/me/audio.m4a",
      startMs: 500,
      durationMs: 3000,
      volume: 0.75,
      muted: false,
    },
  ],
  exportSettings: {
    format: "mp4",
    quality: "high",
    outputPath: "/Users/me/Desktop/export.mp4",
    includeAudio: true,
    fastStart: true,
  },
};

describe("media ffmpeg timeline commands", () => {
  it("collects every local source path for preflight validation", () => {
    expect(collectTimelineSourcePaths(timeline)).toEqual(["/Users/me/source.mp4", "/Users/me/audio.m4a"]);
  });

  it("builds a local timeline render command with video overlay, mixed audio, x264, AAC, and faststart", () => {
    const args = buildRenderTimelineArgs({ timeline, outputPath: "/Users/me/Desktop/export.mp4" });

    expect(args).toContain("-filter_complex");
    expect(args).toContain("/Users/me/source.mp4");
    expect(args).toContain("/Users/me/audio.m4a");
    expect(args).toContain("-map");
    expect(args).toContain("[vout]");
    expect(args).toContain("[aout]");
    expect(args).toContain("libx264");
    expect(args).toContain("aac");
    expect(args).toContain("+faststart");
    expect(args.at(-1)).toBe("/Users/me/Desktop/export.mp4");
    expect(args.join(" ")).toContain("overlay=");
    expect(args.join(" ")).toContain("amix=inputs=1");
  });

  it("applies supported editor effects in the local timeline render filter graph", () => {
    const effectTimeline = {
      ...timeline,
      visualTracks: [
        {
          ...timeline.visualTracks[0],
          effects: [
            { id: "blur", name: "Blur", type: "filter", params: { amount: 4 } },
            { id: "brightness", name: "Brightness", type: "adjustment", params: { value: 125 } },
            { id: "saturation", name: "Saturation", type: "adjustment", params: { value: 80 } },
          ],
        },
      ],
    };

    const args = buildRenderTimelineArgs({ timeline: effectTimeline, outputPath: "/Users/me/Desktop/export.mp4" });
    const filterGraph = args[args.indexOf("-filter_complex") + 1];

    expect(filterGraph).toContain("boxblur=4.000");
    expect(filterGraph).toContain("eq=brightness=0.250:saturation=0.800");
  });

  it("applies supported editor masks in the local timeline render filter graph", () => {
    const maskTimeline = {
      ...timeline,
      visualTracks: [
        {
          ...timeline.visualTracks[0],
          masks: [
            { id: "mask-1", type: "rectangle", inverted: false, feather: 8, opacity: 0.75 },
            { id: "mask-2", type: "ellipse", inverted: true, feather: 4, opacity: 0.5 },
          ],
        },
      ],
    };

    const args = buildRenderTimelineArgs({ timeline: maskTimeline, outputPath: "/Users/me/Desktop/export.mp4" });
    const filterGraph = args[args.indexOf("-filter_complex") + 1];

    expect(filterGraph).toContain("geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(between(X,W*0.1,W*0.9)*between(Y,H*0.1,H*0.9),alpha(X,Y)*0.750,0)'");
    expect(filterGraph).toContain("geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(((X-W/2)*(X-W/2))/(W*W*0.2025)+((Y-H/2)*(Y-H/2))/(H*H*0.2025)<=1,0,alpha(X,Y)*0.500)'");
  });

  it("renders editor text tracks with local FFmpeg drawtext without requiring a source file", () => {
    const textTimeline = {
      ...timeline,
      visualTracks: [
        {
          id: "text-1",
          type: "text",
          name: "Title",
          text: "Hello WZRD",
          startMs: 1000,
          durationMs: 2500,
          layer: 0,
          transform: {
            position: { x: 24, y: -12 },
            scale: { x: 1.5, y: 1.5 },
            rotation: 0,
            opacity: 0.75,
          },
          opacity: 0.75,
          style: {
            fontSize: 80,
            color: "#f97316",
            backgroundColor: "#101010",
          },
        },
      ],
      audioTracks: [],
      exportSettings: {
        ...timeline.exportSettings,
        includeAudio: false,
      },
    };

    expect(collectTimelineSourcePaths(textTimeline)).toEqual([]);

    const args = buildRenderTimelineArgs({ timeline: textTimeline, outputPath: "/Users/me/Desktop/export.mp4" });
    const filterGraph = args[args.indexOf("-filter_complex") + 1];

    expect(args).not.toContain("/Users/me/source.mp4");
    expect(filterGraph).toContain("drawtext=");
    expect(filterGraph).toContain("text='Hello WZRD'");
    expect(filterGraph).toContain("fontsize=120");
    expect(filterGraph).toContain("fontcolor=0xf97316@0.750");
    expect(filterGraph).toContain("box=1:boxcolor=0x101010@0.750:boxborderw=12");
    expect(filterGraph).toContain("enable='between(t,1.000,3.500)'");
    expect(filterGraph).toContain("[vout]");
  });

  it("renders editor graphic element tracks locally without requiring a source file", () => {
    const elementTimeline = {
      ...timeline,
      visualTracks: [
        {
          id: "element-1",
          type: "element",
          name: "Rectangle",
          element: {
            elementType: "shape",
            shape: "rectangle",
            color: "#FF6B4A",
          },
          startMs: 500,
          durationMs: 3000,
          layer: 0,
          transform: {
            position: { x: -40, y: 20 },
            scale: { x: 1.25, y: 0.75 },
            rotation: 0,
            opacity: 0.8,
          },
          opacity: 0.8,
        },
      ],
      audioTracks: [],
      exportSettings: {
        ...timeline.exportSettings,
        includeAudio: false,
      },
    };

    expect(collectTimelineSourcePaths(elementTimeline)).toEqual([]);

    const args = buildRenderTimelineArgs({ timeline: elementTimeline, outputPath: "/Users/me/Desktop/export.mp4" });
    const filterGraph = args[args.indexOf("-filter_complex") + 1];

    expect(args).not.toContain("/Users/me/source.mp4");
    expect(filterGraph).toContain("drawbox=");
    expect(filterGraph).toContain("w=400:h=135");
    expect(filterGraph).toContain("color=0xFF6B4A@0.800");
    expect(filterGraph).toContain("enable='between(t,0.500,3.500)'");
    expect(filterGraph).toContain("[vout]");
  });

  it("honors editor retime playback rates for local video and audio timeline export", () => {
    const retimedTimeline = {
      ...timeline,
      visualTracks: [
        {
          ...timeline.visualTracks[0],
          durationMs: 2000,
          playbackRate: 2,
        },
      ],
      audioTracks: [
        {
          ...timeline.audioTracks[0],
          durationMs: 8000,
          playbackRate: 0.5,
        },
      ],
    };

    const args = buildRenderTimelineArgs({ timeline: retimedTimeline, outputPath: "/Users/me/Desktop/export.mp4" });
    const sourceInputIndex = args.indexOf("/Users/me/source.mp4");
    const audioInputIndex = args.indexOf("/Users/me/audio.m4a");
    const filterGraph = args[args.indexOf("-filter_complex") + 1];

    expect(args[sourceInputIndex - 2]).toBe("4.000");
    expect(args[audioInputIndex - 2]).toBe("4.000");
    expect(filterGraph).toContain("setpts=(PTS-STARTPTS)/2.000+0.000/TB");
    expect(filterGraph).toContain("atrim=0:4.000,asetpts=PTS-STARTPTS,atempo=0.500");
    expect(filterGraph).toContain("adelay=500|500");
  });

  it("renders supported position and audio volume keyframes through local FFmpeg expressions", () => {
    const keyframedTimeline = {
      ...timeline,
      visualTracks: [
        {
          ...timeline.visualTracks[0],
          keyframes: [
            {
              id: "clip-position-a",
              targetId: "clip-1",
              targetType: "clip",
              time: 0,
              propertyPath: "transforms.position",
              properties: { transforms: { position: { x: 0, y: 0 } } },
            },
            {
              id: "clip-position-b",
              targetId: "clip-1",
              targetType: "clip",
              time: 2000,
              propertyPath: "transforms.position",
              properties: { transforms: { position: { x: 120, y: -60 } } },
            },
          ],
        },
      ],
      audioTracks: [
        {
          ...timeline.audioTracks[0],
          startMs: 500,
          keyframes: [
            {
              id: "audio-volume-a",
              targetId: "audio-1",
              targetType: "audio",
              time: 500,
              propertyPath: "volume",
              properties: { volume: 1 },
            },
            {
              id: "audio-volume-b",
              targetId: "audio-1",
              targetType: "audio",
              time: 2500,
              propertyPath: "volume",
              properties: { volume: 0.25 },
            },
          ],
        },
      ],
    };

    const args = buildRenderTimelineArgs({ timeline: keyframedTimeline, outputPath: "/Users/me/Desktop/export.mp4" });
    const filterGraph = args[args.indexOf("-filter_complex") + 1];

    expect(filterGraph).toContain("overlay=x=");
    expect(filterGraph).toContain("(0.000+(120.000-0.000)*(t-0.000)/2.000)");
    expect(filterGraph).toContain("(0.000+(-60.000-0.000)*(t-0.000)/2.000)");
    expect(filterGraph).toContain("volume='if(lt(t,0.000),1.000,if(lte(t,2.000),(1.000+(0.250-1.000)*(t-0.000)/2.000),0.250))':eval=frame");
  });

  it("renders visual opacity keyframes through local FFmpeg alpha expressions", () => {
    const keyframedTimeline = {
      ...timeline,
      visualTracks: [
        {
          ...timeline.visualTracks[0],
          keyframes: [
            {
              id: "clip-opacity-a",
              targetId: "clip-1",
              targetType: "clip",
              time: 0,
              propertyPath: "transforms.opacity",
              properties: { transforms: { opacity: 1 } },
            },
            {
              id: "clip-opacity-b",
              targetId: "clip-1",
              targetType: "clip",
              time: 2000,
              propertyPath: "transforms.opacity",
              properties: { transforms: { opacity: 0.25 } },
            },
          ],
        },
      ],
    };

    const args = buildRenderTimelineArgs({ timeline: keyframedTimeline, outputPath: "/Users/me/Desktop/export.mp4" });
    const filterGraph = args[args.indexOf("-filter_complex") + 1];

    expect(filterGraph).toContain("geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*");
    expect(filterGraph).toContain("(1.000+(0.250-1.000)*(t-0.000)/2.000)");
  });

  it("renders visual scale keyframes through local FFmpeg scale expressions", () => {
    const keyframedTimeline = {
      ...timeline,
      visualTracks: [
        {
          ...timeline.visualTracks[0],
          keyframes: [
            {
              id: "clip-scale-a",
              targetId: "clip-1",
              targetType: "clip",
              time: 0,
              propertyPath: "transforms.scale",
              properties: { transforms: { scale: { x: 1, y: 1 } } },
            },
            {
              id: "clip-scale-b",
              targetId: "clip-1",
              targetType: "clip",
              time: 2000,
              propertyPath: "transforms.scale",
              properties: { transforms: { scale: { x: 1.5, y: 0.5 } } },
            },
          ],
        },
      ],
    };

    const args = buildRenderTimelineArgs({ timeline: keyframedTimeline, outputPath: "/Users/me/Desktop/export.mp4" });
    const filterGraph = args[args.indexOf("-filter_complex") + 1];

    expect(filterGraph).toContain("scale=w='");
    expect(filterGraph).toContain("(1920.000+(2880.000-1920.000)*(t-0.000)/2.000)");
    expect(filterGraph).toContain("(1080.000+(540.000-1080.000)*(t-0.000)/2.000)");
  });

  it("renders static visual rotation through local FFmpeg rotate filters", () => {
    const rotatedTimeline = {
      ...timeline,
      visualTracks: [
        {
          ...timeline.visualTracks[0],
          transform: {
            ...timeline.visualTracks[0].transform,
            rotation: 45,
          },
        },
      ],
    };

    const args = buildRenderTimelineArgs({ timeline: rotatedTimeline, outputPath: "/Users/me/Desktop/export.mp4" });
    const filterGraph = args[args.indexOf("-filter_complex") + 1];

    expect(filterGraph).toContain(",rotate='0.785'");
    expect(filterGraph).toContain("fillcolor=black@0");
  });

  it("renders visual rotation keyframes through local FFmpeg rotate expressions", () => {
    const keyframedTimeline = {
      ...timeline,
      visualTracks: [
        {
          ...timeline.visualTracks[0],
          keyframes: [
            {
              id: "clip-rotation-a",
              targetId: "clip-1",
              targetType: "clip",
              time: 0,
              propertyPath: "transforms.rotation",
              properties: { transforms: { rotation: 0 } },
            },
            {
              id: "clip-rotation-b",
              targetId: "clip-1",
              targetType: "clip",
              time: 2000,
              propertyPath: "transforms.rotation",
              properties: { transforms: { rotation: 90 } },
            },
          ],
        },
      ],
    };

    const args = buildRenderTimelineArgs({ timeline: keyframedTimeline, outputPath: "/Users/me/Desktop/export.mp4" });
    const filterGraph = args[args.indexOf("-filter_complex") + 1];

    expect(filterGraph).toContain(",rotate='");
    expect(filterGraph).toContain("(0.000+(1.571-0.000)*(t-0.000)/2.000)");
    expect(filterGraph).toContain("fillcolor=black@0");
  });

  it("renders rotated text clips through local FFmpeg layer rotation", () => {
    const textTimeline = {
      ...timeline,
      visualTracks: [
        {
          id: "text-1",
          type: "text",
          name: "Title",
          text: "Opening Title",
          startMs: 0,
          durationMs: 5000,
          layer: 0,
          transform: {
            position: { x: 120, y: -40 },
            scale: { x: 1, y: 1 },
            rotation: 15,
            opacity: 1,
          },
          opacity: 1,
          style: {
            color: "#ffffff",
            fontSize: 72,
          },
        },
      ],
      audioTracks: [],
      exportSettings: {
        ...timeline.exportSettings,
        includeAudio: false,
      },
    };

    const args = buildRenderTimelineArgs({ timeline: textTimeline, outputPath: "/Users/me/Desktop/export.mp4" });
    const filterGraph = args[args.indexOf("-filter_complex") + 1];

    expect(filterGraph).toContain("color=c=black@0:s=");
    expect(filterGraph).toContain("drawtext=text='Opening Title'");
    expect(filterGraph).toContain("rotate='0.262'");
    expect(filterGraph).toContain("overlay=x=(W-w)/2+120.000:y=(H-h)/2-40.000");
  });

  it("renders rotated graphic elements through local FFmpeg layer rotation", () => {
    const elementTimeline = {
      ...timeline,
      visualTracks: [
        {
          id: "element-1",
          type: "element",
          name: "Shape",
          startMs: 0,
          durationMs: 5000,
          layer: 0,
          transform: {
            position: { x: -80, y: 60 },
            scale: { x: 1, y: 1 },
            rotation: -30,
            opacity: 0.8,
          },
          opacity: 0.8,
          element: {
            elementType: "shape",
            shape: "rectangle",
            color: "#ff0000",
          },
        },
      ],
      audioTracks: [],
      exportSettings: {
        ...timeline.exportSettings,
        includeAudio: false,
      },
    };

    const args = buildRenderTimelineArgs({ timeline: elementTimeline, outputPath: "/Users/me/Desktop/export.mp4" });
    const filterGraph = args[args.indexOf("-filter_complex") + 1];

    expect(filterGraph).toContain("drawbox=x=0:y=0:w=320:h=180:color=0xff0000@0.800");
    expect(filterGraph).toContain("rotate='-0.524'");
    expect(filterGraph).toContain("overlay=x=(W-w)/2-80.000:y=(H-h)/2+60.000");
  });

  it("renders ellipse graphic elements as ellipse layers instead of rectangle boxes", () => {
    const elementTimeline = {
      ...timeline,
      visualTracks: [
        {
          id: "element-1",
          type: "element",
          name: "Circle",
          startMs: 0,
          durationMs: 5000,
          layer: 0,
          transform: {
            position: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            opacity: 0.75,
          },
          opacity: 0.75,
          element: {
            elementType: "shape",
            shape: "ellipse",
            color: "#00ff88",
          },
        },
      ],
      audioTracks: [],
      exportSettings: {
        ...timeline.exportSettings,
        includeAudio: false,
      },
    };

    const args = buildRenderTimelineArgs({ timeline: elementTimeline, outputPath: "/Users/me/Desktop/export.mp4" });
    const filterGraph = args[args.indexOf("-filter_complex") + 1];

    expect(filterGraph).toContain("color=c=0x00ff88@0.750:s=320x180");
    expect(filterGraph).toContain("geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(");
    expect(filterGraph).toContain("pow((X-W/2)/(W/2),2)+pow((Y-H/2)/(H/2),2)");
    expect(filterGraph).not.toContain("drawbox=x=0:y=0:w=320:h=180:color=0x00ff88@0.750");
  });

  it("renders line graphic elements as round-cap layers instead of rectangle boxes", () => {
    const elementTimeline = {
      ...timeline,
      visualTracks: [
        {
          id: "element-line-1",
          type: "element",
          name: "Line",
          startMs: 0,
          durationMs: 5000,
          layer: 0,
          transform: {
            position: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            opacity: 0.65,
          },
          opacity: 0.65,
          element: {
            elementType: "line",
            color: "#22ccff",
            strokeWidth: 14,
          },
        },
      ],
      audioTracks: [],
      exportSettings: {
        ...timeline.exportSettings,
        includeAudio: false,
      },
    };

    const args = buildRenderTimelineArgs({ timeline: elementTimeline, outputPath: "/Users/me/Desktop/export.mp4" });
    const filterGraph = args[args.indexOf("-filter_complex") + 1];

    expect(filterGraph).toContain("color=c=0x22ccff@0.650:s=360x14");
    expect(filterGraph).toContain("geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)'");
    expect(filterGraph).toContain("if(between(X,H/2,W-H/2),alpha(X,Y)");
    expect(filterGraph).toContain("pow(X-H/2,2)+pow(Y-H/2,2)");
    expect(filterGraph).toContain("pow(X-(W-H/2),2)+pow(Y-H/2,2)");
    expect(filterGraph).not.toContain("drawbox=x=0:y=0:w=360:h=14:color=0x22ccff@0.650");
  });

  it("renders text rotation keyframes through local FFmpeg layer rotation expressions", () => {
    const textTimeline = {
      ...timeline,
      visualTracks: [
        {
          id: "text-1",
          type: "text",
          name: "Title",
          text: "Opening Title",
          startMs: 0,
          durationMs: 5000,
          layer: 0,
          transform: {
            position: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            opacity: 1,
          },
          opacity: 1,
          style: {
            color: "#ffffff",
            fontSize: 72,
          },
          keyframes: [
            {
              id: "text-rotation-a",
              targetId: "text-1",
              targetType: "clip",
              time: 0,
              propertyPath: "transforms.rotation",
              properties: { transforms: { rotation: 0 } },
            },
            {
              id: "text-rotation-b",
              targetId: "text-1",
              targetType: "clip",
              time: 2000,
              propertyPath: "transforms.rotation",
              properties: { transforms: { rotation: 45 } },
            },
          ],
        },
      ],
      audioTracks: [],
      exportSettings: {
        ...timeline.exportSettings,
        includeAudio: false,
      },
    };

    const args = buildRenderTimelineArgs({ timeline: textTimeline, outputPath: "/Users/me/Desktop/export.mp4" });
    const filterGraph = args[args.indexOf("-filter_complex") + 1];

    expect(filterGraph).toContain("drawtext=text='Opening Title'");
    expect(filterGraph).toContain("rotate='");
    expect(filterGraph).toContain("(0.000+(0.785-0.000)*(t-0.000)/2.000)");
  });

  it("renders graphic element rotation keyframes through local FFmpeg layer rotation expressions", () => {
    const elementTimeline = {
      ...timeline,
      visualTracks: [
        {
          id: "element-1",
          type: "element",
          name: "Shape",
          startMs: 0,
          durationMs: 5000,
          layer: 0,
          transform: {
            position: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            opacity: 0.8,
          },
          opacity: 0.8,
          element: {
            elementType: "shape",
            shape: "rectangle",
            color: "#ff0000",
          },
          keyframes: [
            {
              id: "element-rotation-a",
              targetId: "element-1",
              targetType: "clip",
              time: 0,
              propertyPath: "transforms.rotation",
              properties: { transforms: { rotation: 0 } },
            },
            {
              id: "element-rotation-b",
              targetId: "element-1",
              targetType: "clip",
              time: 2000,
              propertyPath: "transforms.rotation",
              properties: { transforms: { rotation: -45 } },
            },
          ],
        },
      ],
      audioTracks: [],
      exportSettings: {
        ...timeline.exportSettings,
        includeAudio: false,
      },
    };

    const args = buildRenderTimelineArgs({ timeline: elementTimeline, outputPath: "/Users/me/Desktop/export.mp4" });
    const filterGraph = args[args.indexOf("-filter_complex") + 1];

    expect(filterGraph).toContain("drawbox=x=0:y=0:w=320:h=180:color=0xff0000@0.800");
    expect(filterGraph).toContain("rotate='");
    expect(filterGraph).toContain("(0.000+(-0.785-0.000)*(t-0.000)/2.000)");
  });

  it("renders text opacity keyframes through local FFmpeg layer alpha expressions", () => {
    const textTimeline = {
      ...timeline,
      visualTracks: [
        {
          id: "text-1",
          type: "text",
          name: "Title",
          text: "Opening Title",
          startMs: 0,
          durationMs: 5000,
          layer: 0,
          transform: {
            position: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            opacity: 1,
          },
          opacity: 1,
          style: {
            color: "#ffffff",
            fontSize: 72,
          },
          keyframes: [
            {
              id: "text-opacity-a",
              targetId: "text-1",
              targetType: "clip",
              time: 0,
              propertyPath: "transforms.opacity",
              properties: { transforms: { opacity: 1 } },
            },
            {
              id: "text-opacity-b",
              targetId: "text-1",
              targetType: "clip",
              time: 2000,
              propertyPath: "transforms.opacity",
              properties: { transforms: { opacity: 0.25 } },
            },
          ],
        },
      ],
      audioTracks: [],
      exportSettings: {
        ...timeline.exportSettings,
        includeAudio: false,
      },
    };

    const args = buildRenderTimelineArgs({ timeline: textTimeline, outputPath: "/Users/me/Desktop/export.mp4" });
    const filterGraph = args[args.indexOf("-filter_complex") + 1];

    expect(filterGraph).toContain("drawtext=text='Opening Title'");
    expect(filterGraph).toContain("geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*");
    expect(filterGraph).toContain("(1.000+(0.250-1.000)*(t-0.000)/2.000)");
  });

  it("renders graphic element opacity keyframes through local FFmpeg layer alpha expressions", () => {
    const elementTimeline = {
      ...timeline,
      visualTracks: [
        {
          id: "element-1",
          type: "element",
          name: "Shape",
          startMs: 0,
          durationMs: 5000,
          layer: 0,
          transform: {
            position: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            opacity: 0.8,
          },
          opacity: 0.8,
          element: {
            elementType: "shape",
            shape: "rectangle",
            color: "#ff0000",
          },
          keyframes: [
            {
              id: "element-opacity-a",
              targetId: "element-1",
              targetType: "clip",
              time: 0,
              propertyPath: "transforms.opacity",
              properties: { transforms: { opacity: 0.8 } },
            },
            {
              id: "element-opacity-b",
              targetId: "element-1",
              targetType: "clip",
              time: 2000,
              propertyPath: "transforms.opacity",
              properties: { transforms: { opacity: 0.1 } },
            },
          ],
        },
      ],
      audioTracks: [],
      exportSettings: {
        ...timeline.exportSettings,
        includeAudio: false,
      },
    };

    const args = buildRenderTimelineArgs({ timeline: elementTimeline, outputPath: "/Users/me/Desktop/export.mp4" });
    const filterGraph = args[args.indexOf("-filter_complex") + 1];

    expect(filterGraph).toContain("drawbox=x=0:y=0:w=320:h=180:color=0xff0000@1.000");
    expect(filterGraph).toContain("geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='alpha(X,Y)*");
    expect(filterGraph).toContain("(0.800+(0.100-0.800)*(t-0.000)/2.000)");
  });

  it("renders text scale keyframes through local FFmpeg layer scale expressions", () => {
    const textTimeline = {
      ...timeline,
      visualTracks: [
        {
          id: "text-1",
          type: "text",
          name: "Title",
          text: "Opening Title",
          startMs: 0,
          durationMs: 5000,
          layer: 0,
          transform: {
            position: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            opacity: 1,
          },
          opacity: 1,
          style: {
            color: "#ffffff",
            fontSize: 72,
          },
          keyframes: [
            {
              id: "text-scale-a",
              targetId: "text-1",
              targetType: "clip",
              time: 0,
              propertyPath: "transforms.scale",
              properties: { transforms: { scale: { x: 1, y: 1 } } },
            },
            {
              id: "text-scale-b",
              targetId: "text-1",
              targetType: "clip",
              time: 2000,
              propertyPath: "transforms.scale",
              properties: { transforms: { scale: { x: 1.5, y: 0.5 } } },
            },
          ],
        },
      ],
      audioTracks: [],
      exportSettings: {
        ...timeline.exportSettings,
        includeAudio: false,
      },
    };

    const args = buildRenderTimelineArgs({ timeline: textTimeline, outputPath: "/Users/me/Desktop/export.mp4" });
    const filterGraph = args[args.indexOf("-filter_complex") + 1];

    expect(filterGraph).toContain("drawtext=text='Opening Title'");
    expect(filterGraph).toContain("scale=w='");
    expect(filterGraph).toContain("(581.000+(871.500-581.000)*(t-0.000)/2.000)");
    expect(filterGraph).toContain("(94.000+(47.000-94.000)*(t-0.000)/2.000)");
  });

  it("renders graphic element scale keyframes through local FFmpeg layer scale expressions", () => {
    const elementTimeline = {
      ...timeline,
      visualTracks: [
        {
          id: "element-1",
          type: "element",
          name: "Shape",
          startMs: 0,
          durationMs: 5000,
          layer: 0,
          transform: {
            position: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            opacity: 0.8,
          },
          opacity: 0.8,
          element: {
            elementType: "shape",
            shape: "rectangle",
            color: "#ff0000",
          },
          keyframes: [
            {
              id: "element-scale-a",
              targetId: "element-1",
              targetType: "clip",
              time: 0,
              propertyPath: "transforms.scale",
              properties: { transforms: { scale: { x: 1, y: 1 } } },
            },
            {
              id: "element-scale-b",
              targetId: "element-1",
              targetType: "clip",
              time: 2000,
              propertyPath: "transforms.scale",
              properties: { transforms: { scale: { x: 1.5, y: 0.5 } } },
            },
          ],
        },
      ],
      audioTracks: [],
      exportSettings: {
        ...timeline.exportSettings,
        includeAudio: false,
      },
    };

    const args = buildRenderTimelineArgs({ timeline: elementTimeline, outputPath: "/Users/me/Desktop/export.mp4" });
    const filterGraph = args[args.indexOf("-filter_complex") + 1];

    expect(filterGraph).toContain("drawbox=x=0:y=0:w=320:h=180:color=0xff0000@0.800");
    expect(filterGraph).toContain("scale=w='");
    expect(filterGraph).toContain("(320.000+(480.000-320.000)*(t-0.000)/2.000)");
    expect(filterGraph).toContain("(180.000+(90.000-180.000)*(t-0.000)/2.000)");
  });

  it("rejects unsupported visual keyframe properties instead of dropping them from local renders", () => {
    const unsupportedTimeline = {
      ...timeline,
      visualTracks: [
        {
          ...timeline.visualTracks[0],
          keyframes: [
            {
              id: "clip-crop",
              targetId: "clip-1",
              targetType: "clip",
              time: 2000,
              propertyPath: "crop.left",
              properties: { crop: { left: 12 } },
            },
          ],
        },
      ],
    };

    expect(() => buildRenderTimelineArgs({ timeline: unsupportedTimeline, outputPath: "/Users/me/Desktop/export.mp4" })).toThrow(/crop\.left.*not supported/i);
  });

  it("splits slow audio retimes into FFmpeg atempo stages", () => {
    const slowAudioTimeline = {
      ...timeline,
      audioTracks: [
        {
          ...timeline.audioTracks[0],
          durationMs: 8000,
          playbackRate: 0.25,
        },
      ],
    };

    const args = buildRenderTimelineArgs({ timeline: slowAudioTimeline, outputPath: "/Users/me/Desktop/export.mp4" });
    const filterGraph = args[args.indexOf("-filter_complex") + 1];

    expect(filterGraph).toContain("atrim=0:2.000,asetpts=PTS-STARTPTS,atempo=0.500,atempo=0.500");
  });

  it("builds preview proxy and waveform extraction commands for shared desktop media helpers", () => {
    const proxyArgs = buildRenderPreviewProxyArgs({
      sourcePath: "/Users/me/source.mov",
      outputPath: "/Users/me/proxy.mp4",
      maxWidth: 1280,
      maxHeight: 720,
    });
    expect(proxyArgs).toContain("/Users/me/source.mov");
    expect(proxyArgs.join(" ")).toContain("scale=1280:720:force_original_aspect_ratio=decrease");
    expect(proxyArgs).toContain("libx264");
    expect(proxyArgs).toContain("aac");
    expect(proxyArgs).toContain("+faststart");

    const waveformArgs = buildExtractWaveformPcmArgs({
      sourcePath: "/Users/me/audio.wav",
      sampleRate: 2000,
    });
    expect(waveformArgs).toContain("/Users/me/audio.wav");
    expect(waveformArgs).toContain("f32le");
    expect(waveformArgs.at(-1)).toBe("pipe:1");
  });

  it("builds local Studio video utility commands without fal model ids", () => {
    const concatArgs = buildStudioConcatArgs({
      sourcePaths: ["/Users/me/a.mp4", "/Users/me/b.mp4"],
      outputPath: "/Users/me/concat.mp4",
    });
    expect(concatArgs).toContain("/Users/me/a.mp4");
    expect(concatArgs).toContain("/Users/me/b.mp4");
    expect(concatArgs.join(" ")).toContain("concat=n=2:v=1:a=1");
    expect(concatArgs).toContain("libx264");
    expect(concatArgs).toContain("aac");

    const mergeArgs = buildStudioMergeAudioVideoArgs({
      videoPath: "/Users/me/video.mp4",
      audioPath: "/Users/me/audio.wav",
      outputPath: "/Users/me/merged.mp4",
    });
    expect(mergeArgs.join(" ")).toContain("-map 0:v:0 -map 1:a:0");
    expect(mergeArgs).toContain("libx264");
    expect(mergeArgs).toContain("aac");
    expect(JSON.stringify({ concatArgs, mergeArgs })).not.toContain("fal-ai/");
  });

  it("builds local Studio audio commands for merge, loudnorm, and compression", () => {
    const mergeArgs = buildStudioAudioMergeArgs({
      sourcePaths: ["/Users/me/a.wav", "/Users/me/b.wav"],
      outputPath: "/Users/me/mixed.m4a",
      params: { mode: "mix" },
    });
    expect(mergeArgs.join(" ")).toContain("amix=inputs=2");
    expect(mergeArgs).toContain("aac");

    const loudnormArgs = buildStudioAudioFilterArgs({
      sourcePath: "/Users/me/audio.wav",
      outputPath: "/Users/me/loudnorm.m4a",
      filter: "loudnorm=I=-16:TP=-1.5:LRA=11",
    });
    expect(loudnormArgs.join(" ")).toContain("loudnorm=I=-16:TP=-1.5:LRA=11");
    expect(loudnormArgs).toContain("aac");

    const compressorArgs = buildStudioAudioFilterArgs({
      sourcePath: "/Users/me/audio.wav",
      outputPath: "/Users/me/compressed.m4a",
      filter: "acompressor=threshold=-18dB:ratio=4:attack=20:release=250",
    });
    expect(compressorArgs.join(" ")).toContain("acompressor=");
  });

  it("builds local Studio image transform commands", () => {
    const colorGradeArgs = buildStudioImageTransformArgs({
      sourcePath: "/Users/me/input.png",
      outputPath: "/Users/me/output.png",
      actionId: "image.color-grade",
      params: { brightness: 20, contrast: 10, saturation: 30 },
    });
    expect(colorGradeArgs.join(" ")).toContain("eq=");

    const rotateArgs = buildStudioImageTransformArgs({
      sourcePath: "/Users/me/input.png",
      outputPath: "/Users/me/rotated.png",
      actionId: "image.rotate",
      params: { angle: 90 },
    });
    expect(rotateArgs.join(" ")).toContain("rotate=");

    const flipArgs = buildStudioImageTransformArgs({
      sourcePath: "/Users/me/input.png",
      outputPath: "/Users/me/flipped.png",
      actionId: "image.flip",
      params: { axis: "both" },
    });
    expect(flipArgs.join(" ")).toContain("hflip,vflip");

    const stereoArgs = buildStudioImageTransformArgs({
      sourcePath: "/Users/me/input.png",
      outputPath: "/Users/me/stereo.png",
      actionId: "image.stereo",
      params: { disparity: 24 },
    });
    expect(stereoArgs.join(" ")).toContain("hstack");

    const panoramaArgs = buildStudioImageTransformArgs({
      sourcePath: "/Users/me/input.png",
      outputPath: "/Users/me/pano.png",
      actionId: "image.panorama",
    });
    expect(panoramaArgs.join(" ")).toContain("crop=2048:1024");
  });

  it("builds local Studio split, speed, and boomerang video commands", () => {
    const splitArgs = buildStudioSplitArgs({
      sourcePath: "/Users/me/input.mp4",
      outputFolder: "/Users/me/splits",
      params: { segmentSeconds: 12 },
    });
    expect(splitArgs).toContain("-segment_time");
    expect(splitArgs).toContain("12");
    expect(splitArgs.at(-1)).toBe("/Users/me/splits/segment-%03d.mp4");

    const speedArgs = buildStudioVideoFilterArgs({
      sourcePath: "/Users/me/input.mp4",
      outputPath: "/Users/me/fast.mp4",
      videoFilter: "setpts=0.500*PTS",
      audioFilter: "atempo=2",
    });
    expect(speedArgs.join(" ")).toContain("-vf setpts=0.500*PTS");
    expect(speedArgs.join(" ")).toContain("-af atempo=2");
    expect(speedArgs).toContain("libx264");

    const boomerangArgs = buildStudioVideoFilterArgs({
      sourcePath: "/Users/me/input.mp4",
      outputPath: "/Users/me/boom.mp4",
      filterComplex: "[0:v]split[v0][v1];[v1]reverse[vr];[v0][vr]concat=n=2:v=1:a=0[vout]",
      mapVideo: "[vout]",
      includeAudio: false,
    });
    expect(boomerangArgs.join(" ")).toContain("reverse");
    expect(boomerangArgs.join(" ")).toContain("concat=n=2:v=1:a=0");
  });

  it("builds local Studio frame grid, video effect, watermark, and audio extraction commands", () => {
    const gridArgs = buildStudioFrameGridArgs({
      sourcePath: "/Users/me/input.mp4",
      outputPath: "/Users/me/grid.jpg",
      params: { rows: 3, columns: 4, gap: 6, backgroundColor: "#111111" },
    });
    expect(gridArgs.join(" ")).toContain("tile=4x3");
    expect(gridArgs.join(" ")).toContain("padding=6");

    const effectArgs = buildStudioVideoFilterArgs({
      sourcePath: "/Users/me/input.mp4",
      outputPath: "/Users/me/effect.mp4",
      videoFilter: "eq=contrast=1.080:saturation=1.150",
    });
    expect(effectArgs.join(" ")).toContain("eq=contrast");

    const watermarkArgs = buildStudioWatermarkArgs({
      sourcePath: "/Users/me/input.mp4",
      watermarkPath: "/Users/me/logo.png",
      outputPath: "/Users/me/watermarked.mp4",
      params: { opacity: 0.5 },
    });
    expect(watermarkArgs.join(" ")).toContain("overlay=");
    expect(watermarkArgs.join(" ")).toContain("colorchannelmixer=aa=0.500");

    const audioArgs = buildStudioAudioSeparateArgs({
      sourcePath: "/Users/me/input.mp4",
      outputPath: "/Users/me/audio.m4a",
    });
    expect(audioArgs.join(" ")).toContain("-map 0:a:0");
    expect(audioArgs).toContain("aac");
  });
});
