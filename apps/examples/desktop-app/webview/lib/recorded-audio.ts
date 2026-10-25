import { MAX_RECORDED_AUDIO_BYTES } from "./voice-input-limits";

/** Portable PCM16 WAV for local Whisper/Kobold endpoints; conversion stays on the PC. */
export function encodeMonoWav(samples: Float32Array, sampleRate = 16000): Uint8Array {
  const size = 44 + samples.length * 2;
  if (!samples.length || size > MAX_RECORDED_AUDIO_BYTES) throw new Error("Recorded audio is empty or exceeds the recording limit.");
  const bytes = new Uint8Array(size);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => { for (let i = 0; i < value.length; i++) bytes[offset + i] = value.charCodeAt(i); };
  text(0, "RIFF"); view.setUint32(4, size - 8, true); text(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const sample = Number.isFinite(samples[i]) ? Math.max(-1, Math.min(1, samples[i])) : 0;
    view.setInt16(44 + i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
  }
  return bytes;
}

export async function normalizeRecordedAudio(blob: Blob): Promise<Uint8Array> {
  if (!blob.size || blob.size > MAX_RECORDED_AUDIO_BYTES) throw new Error("Recorded audio is empty or exceeds the recording limit.");
  const decoder = new AudioContext();
  try {
    const decoded = await decoder.decodeAudioData(await blob.arrayBuffer());
    const frames = Math.ceil(decoded.duration * 16000);
    if (!Number.isSafeInteger(frames) || frames <= 0 || 44 + frames * 2 > MAX_RECORDED_AUDIO_BYTES) {
      throw new Error("Recorded audio is empty or exceeds the recording limit.");
    }
    const context = new OfflineAudioContext(1, frames, 16000);
    const source = context.createBufferSource();
    source.buffer = decoded;
    source.connect(context.destination);
    source.start();
    const rendered = await context.startRendering();
    return encodeMonoWav(rendered.getChannelData(0));
  } finally {
    await decoder.close();
  }
}
