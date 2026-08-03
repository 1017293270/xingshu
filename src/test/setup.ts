import "@testing-library/jest-dom/vitest";
import { beforeEach, vi } from "vitest";

export function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)" ? matches : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    }))
  });
}

setReducedMotion(false);

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
});
