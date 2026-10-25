"use client";

import { desktopClient } from "./desktop-client";
import { MAX_RECORDED_AUDIO_BYTES } from "./voice-input-limits";

/** Batch STT for local OpenAI-compatible servers; never logs audio or text. */
export async function transcribeRecordedAudio(blob: Blob): Promise<string> {
  if (!blob.size || blob.size > MAX_RECORDED_AUDIO_BYTES) {
    throw new Error("Recorded audio is empty or exceeds the recording limit.");
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunks: string[] = [];
  for (let start = 0; start < bytes.length; start += 16384) {
    chunks.push(String.fromCharCode(...bytes.subarray(start, start + 16384)));
  }
  const response = await desktopClient.invoke<{text?: unknown}>("transcribe_audio", {
    audioBase64: btoa(chunks.join("")),
    mediaType: blob.type || "application/octet-stream",
  });
  if (typeof response?.text !== "string") {
    throw new Error("Transcription provider returned no text.");
  }
  return response.text;
}
