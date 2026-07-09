import { act, renderHook, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useVoiceInput } from "./useVoiceInput";

class MockMediaRecorder {
  state: RecordingState = "inactive";
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onstop: (() => void) | null = null;

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.ondataavailable?.({ data: new Blob(["voice"], { type: "audio/webm" }) } as BlobEvent);
    this.onstop?.();
  }
}

describe("useVoiceInput", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("records audio, releases media tracks, and returns to idle", async () => {
    const stopTrack = vi.fn();
    const onAudioReady = vi.fn();
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] }) as unknown as MediaStream);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia }
    });
    vi.stubGlobal("MediaRecorder", MockMediaRecorder as unknown as typeof MediaRecorder);
    const { result } = renderHook(() => useVoiceInput({ onAudioReady }));

    await act(async () => {
      await result.current.start();
    });
    expect(result.current.state).toBe("recording");

    act(() => result.current.stop());

    await waitFor(() => expect(result.current.state).toBe("idle"));
    expect(onAudioReady).toHaveBeenCalledWith(expect.any(Blob));
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it("releases an active recording on unmount without publishing stale audio", async () => {
    const stopTrack = vi.fn();
    const onAudioReady = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] }) as unknown as MediaStream)
      }
    });
    vi.stubGlobal("MediaRecorder", MockMediaRecorder as unknown as typeof MediaRecorder);
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
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] }) as unknown as MediaStream)
      }
    });
    vi.stubGlobal("MediaRecorder", MockMediaRecorder as unknown as typeof MediaRecorder);
    const { result } = renderHook(() => useVoiceInput(), { wrapper: StrictMode });

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.state).toBe("recording");
  });

  it("cancels a recording without publishing audio", async () => {
    const stopTrack = vi.fn();
    const onAudioReady = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({ getTracks: () => [{ stop: stopTrack }] }) as unknown as MediaStream)
      }
    });
    vi.stubGlobal("MediaRecorder", MockMediaRecorder as unknown as typeof MediaRecorder);
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
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia }
    });
    vi.stubGlobal("MediaRecorder", MockMediaRecorder as unknown as typeof MediaRecorder);
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
});
