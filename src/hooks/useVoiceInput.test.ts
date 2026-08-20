import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_VOICE_DURATION_MS, useVoiceInput } from "./useVoiceInput";

class MockMediaRecorder {
  static isTypeSupported(type: string) {
    return type.startsWith("audio/webm");
  }

  state: RecordingState = "inactive";
  mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: (() => void) | null = null;

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType || "audio/webm";
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["voice"], { type: this.mimeType || "audio/webm" }) } as BlobEvent);
    this.onstop?.();
  }
}

function stubMedia(getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: vi.fn() }] }) as unknown as MediaStream)) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia }
  });
  vi.stubGlobal("MediaRecorder", MockMediaRecorder as unknown as typeof MediaRecorder);
  return getUserMedia;
}

describe("useVoiceInput", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("records audio, releases media tracks, and returns to idle", async () => {
    const stopTrack = vi.fn();
    const onAudioReady = vi.fn();
    stubMedia(vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] }) as unknown as MediaStream));
    const { result } = renderHook(() => useVoiceInput({ onAudioReady }));

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe("recording");

    act(() => result.current.stop());

    await waitFor(() => expect(result.current.state).toBe("idle"));
    expect(onAudioReady).toHaveBeenCalledWith(expect.any(Blob), expect.any(AbortSignal));
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("stays in processing until async onAudioReady settles", async () => {
    let resolveReady!: () => void;
    const onAudioReady = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveReady = resolve;
        })
    );
    stubMedia();
    const { result } = renderHook(() => useVoiceInput({ onAudioReady }));

    await act(async () => {
      await result.current.start();
    });
    act(() => result.current.stop());

    await waitFor(() => expect(result.current.state).toBe("processing"));
    expect(onAudioReady).toHaveBeenCalledOnce();

    await act(async () => {
      resolveReady();
    });
    await waitFor(() => expect(result.current.state).toBe("idle"));
  });

  it("does not publish stale audio after cancel during transcription", async () => {
    let resolveReady!: () => void;
    const onAudioReady = vi.fn(
      (_audio: Blob, signal: AbortSignal) =>
        new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
          resolveReady = resolve;
        })
    );
    stubMedia();
    const { result } = renderHook(() => useVoiceInput({ onAudioReady }));

    await act(async () => {
      await result.current.start();
    });
    act(() => result.current.stop());
    await waitFor(() => expect(result.current.state).toBe("processing"));

    const signal = onAudioReady.mock.calls[0]?.[1] as AbortSignal;
    act(() => result.current.cancel());

    expect(signal.aborted).toBe(true);
    await waitFor(() => expect(result.current.state).toBe("idle"));
    resolveReady();
    expect(result.current.state).toBe("idle");
  });

  it("stops automatically after the maximum recording duration", async () => {
    vi.useFakeTimers();
    const onAudioReady = vi.fn();
    stubMedia();
    const { result } = renderHook(() => useVoiceInput({ onAudioReady }));

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe("recording");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(MAX_VOICE_DURATION_MS);
    });

    expect(result.current.state).toBe("idle");
    expect(onAudioReady).toHaveBeenCalledOnce();
  });

  it("releases an active recording on unmount without publishing stale audio", async () => {
    const stopTrack = vi.fn();
    const onAudioReady = vi.fn();
    stubMedia(vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] }) as unknown as MediaStream));
    const { result, unmount } = renderHook(() => useVoiceInput({ onAudioReady }));

    await act(async () => {
      await result.current.start();
    });
    unmount();

    expect(stopTrack).toHaveBeenCalled();
    expect(onAudioReady).not.toHaveBeenCalled();
  });

  it("remains usable when React StrictMode replays its effect", async () => {
    const stopTrack = vi.fn();
    stubMedia(vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] }) as unknown as MediaStream));
    const { result } = renderHook(() => useVoiceInput(), { wrapper: StrictMode });

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe("recording");
  });

  it("cancels a recording without publishing audio", async () => {
    const stopTrack = vi.fn();
    const onAudioReady = vi.fn();
    stubMedia(vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] }) as unknown as MediaStream));
    const { result } = renderHook(() => useVoiceInput({ onAudioReady }));

    await act(async () => {
      await result.current.start();
    });
    act(() => result.current.cancel());

    await waitFor(() => expect(result.current.state).toBe("idle"));
    expect(stopTrack).toHaveBeenCalled();
    expect(onAudioReady).not.toHaveBeenCalled();
  });

  it("cancels a pending permission request and releases the late stream", async () => {
    const stopTrack = vi.fn();
    const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
    let resolveStream!: (value: MediaStream) => void;
    const getUserMedia = vi.fn(
      () => new Promise<MediaStream>((resolve) => {
        resolveStream = resolve;
      })
    );
    stubMedia(getUserMedia);
    const { result } = renderHook(() => useVoiceInput());
    let pendingStart!: Promise<void>;

    act(() => {
      pendingStart = result.current.start();
    });
    await waitFor(() => expect(result.current.state).toBe("permission"));

    act(() => result.current.cancel());
    await act(async () => {
      resolveStream(stream);
      await pendingStart;
    });

    expect(result.current.state).toBe("idle");
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("reports an error when the recording is empty", async () => {
    class EmptyRecorder extends MockMediaRecorder {
      stop() {
        this.state = "inactive";
        this.onstop?.();
      }
    }
    const onError = vi.fn();
    stubMedia();
    vi.stubGlobal("MediaRecorder", EmptyRecorder as unknown as typeof MediaRecorder);
    const { result } = renderHook(() => useVoiceInput({ onError }));

    await act(async () => {
      await result.current.start();
    });
    act(() => result.current.stop());

    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(onError).toHaveBeenCalledWith("没有录到有效语音");
  });

  it("reports a transcription failure from onAudioReady", async () => {
    const onError = vi.fn();
    stubMedia();
    const { result } = renderHook(() =>
      useVoiceInput({
        onAudioReady: async () => {
          throw new Error("无法识别语音内容");
        },
        onError
      })
    );

    await act(async () => {
      await result.current.start();
    });
    act(() => result.current.stop());

    await waitFor(() => expect(result.current.state).toBe("error"));
    expect(onError).toHaveBeenCalledWith("无法识别语音内容");
  });
});
