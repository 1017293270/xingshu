import { useEffect, useState } from "react";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";

export function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(reducedMotionQuery).matches
  );

  useEffect(() => {
    const media = window.matchMedia(reducedMotionQuery);
    const updatePreference = () => setReducedMotion(media.matches);

    media.addEventListener("change", updatePreference);
    updatePreference();

    return () => media.removeEventListener("change", updatePreference);
  }, []);

  return reducedMotion;
}
