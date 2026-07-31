import { describe, expect, it, vi } from "vitest";
import { installVitePreloadRecovery } from "./preloadRecovery";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    }
  };
}

describe("installVitePreloadRecovery", () => {
  it("reloads the current page when a stale deployment asset fails to preload", () => {
    const target = new EventTarget();
    const reload = vi.fn();
    const dispose = installVitePreloadRecovery({
      buildId: "index-old.js",
      reload,
      storage: createMemoryStorage(),
      target
    });
    const event = new Event("vite:preloadError", { cancelable: true });

    target.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledOnce();

    dispose();
  });

  it("reloads at most once for the same deployed entry", () => {
    const target = new EventTarget();
    const reload = vi.fn();
    const storage = createMemoryStorage();
    const firstDispose = installVitePreloadRecovery({
      buildId: "index-old.js",
      reload,
      storage,
      target
    });

    target.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));
    firstDispose();

    const secondDispose = installVitePreloadRecovery({
      buildId: "index-old.js",
      reload,
      storage,
      target
    });
    target.dispatchEvent(new Event("vite:preloadError", { cancelable: true }));

    expect(reload).toHaveBeenCalledOnce();

    secondDispose();
  });
});
