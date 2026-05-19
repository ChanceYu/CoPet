# Audio Asset Format

Rules **established by `pethover`** (no upstream source). Source of truth for audio asset format requirements for clips generated in step 3 of the pipeline.

## Formats

**MP3 only.** Every file under `pethover/audio/` must be `.mp3` (MPEG-1 Layer 3). No other container or codec is accepted; the runtime rejects pet packages that reference non-`.mp3` paths in `pethover.audio`.

The webview decodes via the HTML5 `<audio>` element.

Encoding recommendations:

- Mono, unless stereo separation is meaningful for the clip (it usually isn't for short interaction sounds).
- Constant bitrate (CBR) at 64–128 kbps. Higher bitrates rarely improve perceived quality for short pet sounds.
- 44.1 kHz sample rate.

## Size cap

Per file: **16 MB**. Mirrors the PetHover spritesheet cap — a single sound file should never exceed what a single sprite atlas may.

A typical short interaction sound (≤ 1 second, mono, MP3 @ 64 kbps) is ~8 KB. Anything in the hundreds of KB warrants a second look.

## Loudness

Author to:

- Integrated loudness: **-16 LUFS**.
- True peak: **-1 dBTP** max.

This matches the conservative end of consumer-app guidance and keeps the pet from spiking against the user's system audio.

## Silence handling

Trim leading and trailing silence at authoring time. Latency between the gesture and the audible onset is otherwise audibly off.

## Validation

No automated validator in v1. If a script is added later, it lives under the skill folder. Until then, validation is by review.
