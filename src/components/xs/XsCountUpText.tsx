import { useCountUp } from "@/hooks/useCountUp";

export type XsCountUpTextProps = {
  value: string;
  previousValue?: string;
  durationMs?: number;
  active?: boolean;
  className?: string;
};

export function XsCountUpText({
  value,
  previousValue,
  durationMs = 700,
  active = true,
  className = ""
}: XsCountUpTextProps) {
  const displayValue = useCountUp(value, active, durationMs, previousValue);

  return (
    <span className={`xs-count-up-text ${className}`.trim()}>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true">{displayValue}</span>
    </span>
  );
}
