import { useEffect, useRef, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

type XsStreamingTextProps = {
  text: string;
  ariaLabel: string;
  className?: string;
  isStreaming?: boolean;
  intervalMs?: number;
  onComplete?: () => void;
};

const defaultIntervalMs = 28;

export function XsStreamingText({
  text,
  ariaLabel,
  className = "",
  isStreaming = false,
  intervalMs = defaultIntervalMs,
  onComplete
}: XsStreamingTextProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const onCompleteRef = useRef(onComplete);
  const [visibleLength, setVisibleLength] = useState(() =>
    isStreaming && !prefersReducedMotion ? 0 : text.length
  );

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!isStreaming || prefersReducedMotion || !text) {
      setVisibleLength(text.length);
      const completionTimer = window.setTimeout(() => onCompleteRef.current?.(), 0);
      return () => window.clearTimeout(completionTimer);
    }

    let nextLength = 0;
    setVisibleLength(0);

    const timer = window.setInterval(() => {
      nextLength = Math.min(text.length, nextLength + 1);
      setVisibleLength(nextLength);

      if (nextLength >= text.length) {
        window.clearInterval(timer);
        onCompleteRef.current?.();
      }
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [intervalMs, isStreaming, prefersReducedMotion, text]);

  return (
    <span
      className={`xs-streaming-text ${className}`.trim()}
      role="status"
      aria-label={ariaLabel}
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="sr-only">{text}</span>
      <span className="xs-streaming-text__visual" aria-hidden="true">
        {text.slice(0, visibleLength)}
      </span>
    </span>
  );
}
