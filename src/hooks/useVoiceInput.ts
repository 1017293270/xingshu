import { useCallback, useEffect, useRef, useState } from "react";

export type VoiceInputState = "idle" | "permission" | "recording" | "processing" | "error";

type UseVoiceInputOptions = {
  onAudioReady?: (audio: Blob) => void;
  onError?: (message: string) => void;
};

export function useVoiceInput(options: UseVoiceInputOptions = {}) {
  const [state, setState] = useState<VoiceInputState>("idle");
  const [error, setError] = useState("");
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const requestVersionRef = useRef(0);
  const discardedRecordersRef = useRef(new WeakSet<MediaRecorder>());
  const mountedRef = useRef(true);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const reportError = useCallback(
    (message: string) => {
      requestVersionRef.current += 1;
      if (recorderRef.current) {
        discardedRecordersRef.current.add(recorderRef.current);
      }
      releaseStream();
      recorderRef.current = null;
      if (mountedRef.current) {
        setError(message);
        setState("error");
        optionsRef.current.onError?.(message);
      }
    },
    [releaseStream]
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
      const recorder = new MediaRecorder(stream);
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
        if (!discarded && mountedRef.current) {
          const audio = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
          optionsRef.current.onAudioReady?.(audio);
        }
        if (mountedRef.current) {
          setState("idle");
        }
      };

      recorder.start();
      setState("recording");
    } catch (cause) {
      if (!mountedRef.current || requestVersionRef.current !== requestVersion) {
        return;
      }
      const message = cause instanceof DOMException && cause.name === "NotAllowedError"
        ? "未获得麦克风权限"
        : "无法启动语音输入";
      reportError(message);
    }
  }, [reportError, releaseStream, state]);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      releaseStream();
      return;
    }

    if (mountedRef.current) {
      setState("processing");
    }
    recorder.stop();
  }, [releaseStream]);

  const cancel = useCallback(() => {
    requestVersionRef.current += 1;
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
  }, [releaseStream]);

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
      const recorder = recorderRef.current;
      if (recorder?.state === "recording") {
        discardedRecordersRef.current.add(recorder);
        recorder.stop();
      }
      releaseStream();
    };
  }, [releaseStream]);

  return { cancel, error, start, state, stop, toggle };
}
