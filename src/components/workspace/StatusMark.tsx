import type { VerdictStatus } from "@/lib/science/types";
import { statusPhrase } from "./format";
import { CheckIcon, MissingIcon, WarningIcon } from "./icons";

export function StatusMark({ status }: { status: VerdictStatus }) {
  const Icon =
    status === "within_limits" ? CheckIcon : status === "exceeds_limits" ? WarningIcon : MissingIcon;
  return (
    <span className="inline-flex items-center gap-2 font-medium text-stone-900">
      <Icon />
      <span>{statusPhrase(status)}</span>
    </span>
  );
}
