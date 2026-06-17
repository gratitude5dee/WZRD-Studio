# Clipper Live Scout And Overshoot

The current `/clipper` Analyze flow is for downloaded or local VOD sources. It should keep using local YouTube download, local FFmpeg frame extraction/export, and the existing Supabase/GMI analysis path.

Overshoot should not be used in the VOD flow. It is a better fit for a future Live Clip Scout mode where WZRD captures or joins a realtime stream, analyzes short rolling windows, and proposes clip ranges while the stream is still live.

If Live Clip Scout is built later, keep Overshoot API keys server-side, create streams with an explicit lifecycle, analyze bounded `ovs://` windows, and delete streams when the session ends. The VOD Clipper path should remain deterministic and local-compute-first.
