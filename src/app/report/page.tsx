import type { Metadata } from "next";
import { ReportView } from "@/components/workspace/ReportView";

export const metadata: Metadata = {
  title: "Lunar Window report",
  description:
    "Printable planning report for Lunar Window. An exploratory and educational record, not flight-qualified mission analysis.",
};

export default function ReportPage() {
  return <ReportView />;
}
