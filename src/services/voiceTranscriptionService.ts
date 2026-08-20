import { DataHubServiceError, requestDataHub } from "./dataHubClient";

export const VOICE_TRANSCRIBE_PATH = "/api/ai/voice/transcribe";
export const VOICE_TRANSCRIBE_TIMEOUT_MS = 30_000;

export function appendVoiceTranscript(current: string, transcript: string) {
  const next = transcript.trim();
  if (!next) {
    return current;
  }

  const existing = current.trim();
  return existing ? `${existing} ${next}` : next;
}

function voiceFilename(audio: Blob) {
  const type = audio.type.toLowerCase();
  if (type.includes("wav")) {
    return "voice.wav";
  }
  if (type.includes("mp4") || type.includes("m4a")) {
    return "voice.mp4";
  }
  if (type.includes("mpeg") || type.includes("mp3")) {
    return "voice.mp3";
  }
  if (type.includes("ogg")) {
    return "voice.ogg";
  }
  return "voice.webm";
}

export async function transcribeVoice(audio: Blob, signal?: AbortSignal) {
  if (audio.size === 0) {
    throw new DataHubServiceError("没有录到有效语音");
  }

  const body = new FormData();
  body.append("audio", audio, voiceFilename(audio));
  const result = await requestDataHub<{ text?: string }>(VOICE_TRANSCRIBE_PATH, {
    method: "POST",
    body,
    signal,
    timeoutMs: VOICE_TRANSCRIBE_TIMEOUT_MS
  });
  const text = result?.text?.trim() ?? "";
  if (!text) {
    throw new DataHubServiceError("无法识别语音内容");
  }

  return text;
}
