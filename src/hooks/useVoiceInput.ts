import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceInputState = "idle" | "permission" | "recording" | "processing" | "error";

export const MAX_VOICE_DURATION_MS = 60_000;

type UseVoiceInputOptions = {
  onAudioReady?: (audio: Blob, signal: AbortSignal) => void | Promise<void>;
  onError?: (message: string) => void;
};

function pickRecorderMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }

  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

export function useVoiceInput(options: UseVoiceInputOptions = {}) {
  const [state, setState] = useState<VoiceInputState>("idle");
  const [error, setError] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const requestVersionRef = useRef(0);
  const discardedRecordersRef = useRef(new WeakSet<MediaRecorder>());
  const transcriptionAbortRef = useRef<AbortController | null>(null);
  const maxDurationTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const clearMaxDurationTimer = useCallback(() => {
    if (maxDurationTimerRef.current !== null) {
      window.clearTimeout(maxDurationTimerRef.current);
      maxDurationTimerRef.current = null;
    }
  }, []);

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const abortTranscription = useCallback(() => {
    transcriptionAbortRef.current?.abort();
    transcriptionAbortRef.current = null;
  }, []);

  const reportError = useCallback(
    (message: string) => {
      requestVersionRef.current += 1;
      abortTranscription();
      if (recorderRef.current) {
        discardedRecordersRef.current.add(recorderRef.current);
      }
      clearMaxDurationTimer();
      releaseStream();
      recorderRef.current = null;
      if (mountedRef.current) {
        setError(message);
        setState("error");
        optionsRef.current.onError?.(message);
      }
    },
    [abortTranscription, clearMaxDurationTimer, releaseStream]
  );

  const start = useCallback(async () => {
    if (state === "permission" || state === "recording" || state === "processing") {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      reportError("当前浏览器不支持语音输入");
      return;
    }

    setError("");
    setState("permission");
    const requestVersion = requestVersionRef.current + 1;
    requestVersionRef.current = requestVersion;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current || requestVersionRef.current !== requestVersion) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      const mimeType = pickRecorderMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorderRef.current = recorder;
      const chunks: Blob[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      recorder.onerror = () => reportError("语音录入失败，请检查麦克风权限");
      recorder.onstop = () => {
        const discarded = discardedRecordersRef.current.has(recorder);
        discardedRecordersRef.current.delete(recorder);
        if (recorderRef.current === recorder) {
          recorderRef.current = null;
        }
        stream.getTracks().forEach((track) => track.stop());
        if (streamRef.current === stream) {
          streamRef.current = null;
        }
        clearMaxDurationTimer();

        if (discarded || !mountedRef.current) {
          if (mountedRef.current) {
            setError("");
            setState("idle");
          }
          return;
        }

        const audio = new Blob(chunks, { type: chunks[0]?.type || mimeType || "audio/webm" });
        if (audio.size === 0) {
          reportError("没有录到有效语音");
          return;
        }

        const transcriptionVersion = requestVersionRef.current;
        const abortController = new AbortController();
        transcriptionAbortRef.current = abortController;
        if (mountedRef.current) {
          setState("processing");
        }

        void Promise.resolve()
          .then(() => optionsRef.current.onAudioReady?.(audio, abortController.signal))
          .then(() => {
            if (!mountedRef.current || requestVersionRef.current !== transcriptionVersion) {
              return;
            }
            setState("idle");
          })
          .catch((cause: unknown) => {
            if (
              !mountedRef.current ||
              requestVersionRef.current !== transcriptionVersion ||
              abortController.signal.aborted
            ) {
              if (
                mountedRef.current &&
                abortController.signal.aborted &&
                requestVersionRef.current === transcriptionVersion
              ) {
                setError("");
                setState("idle");
              }
              return;
            }
            const message =
              cause instanceof Error && cause.message.trim()
                ? cause.message
                : "语音转写失败，请稍后重试";
            reportError(message);
          })
          .finally(() => {
            if (transcriptionAbortRef.current === abortController) {
              transcriptionAbortRef.current = null;
            }
          });
      };

      recorder.start();
      setState("recording");
      clearMaxDurationTimer();
      maxDurationTimerRef.current = window.setTimeout(() => {
        const activeRecorder = recorderRef.current;
        if (activeRecorder?.state === "recording") {
          if (mountedRef.current) {
            setState("processing");
          }
          activeRecorder.stop();
        }
      }, MAX_VOICE_DURATION_MS);
    } catch (cause) {
      if (!mountedRef.current || requestVersionRef.current !== requestVersion) {
        return;
      }
      const message = cause instanceof DOMException && cause.name === "NotAllowedError"
        ? "未获得麦克风权限"
        : "无法启动语音输入";
      reportError(message);
    }
  }, [clearMaxDurationTimer, reportError, state]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      releaseStream();
      return;
    }

    clearMaxDurationTimer();
    if (mountedRef.current) {
      setState("processing");
    }
    recorder.stop();
  }, [clearMaxDurationTimer, releaseStream]);

  const cancel = useCallback(() => {
    requestVersionRef.current += 1;
    abortTranscription();
    clearMaxDurationTimer();
    const recorder = recorderRef.current;

    if (recorder) {
      discardedRecordersRef.current.add(recorder);
    }

    if (recorder?.state === "recording") {
      if (mountedRef.current) {
        setState("processing");
      }
      recorder.stop();
      return;
    }

    recorderRef.current = null;
    releaseStream();
    if (mountedRef.current) {
      setError("");
      setState("idle");
    }
  }, [abortTranscription, clearMaxDurationTimer, releaseStream]);

  const toggle = useCallback(() => {
    if (state === "permission") {
      cancel();
      return;
    }
    if (state === "recording") {
      stop();
      return;
    }

    void start();
  }, [cancel, start, state, stop]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      requestVersionRef.current += 1;
      abortTranscription();
      clearMaxDurationTimer();
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") {
        discardedRecordersRef.current.add(recorder);
        recorder.stop();
      }
      releaseStream();
    };
  }, [abortTranscription, clearMaxDurationTimer, releaseStream]);

  return { cancel, error, start, state, stop, toggle };
}
