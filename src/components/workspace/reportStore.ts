import type { ExportReport, LunarSite } from "@/lib/science/types";

export const REPORT_STORAGE_KEY = "lunar-window-report";

export type StoredReport = ExportReport & { sites?: LunarSite[] };

export function saveReport(report: StoredReport): void {
  const text = JSON.stringify(report);
  window.sessionStorage.setItem(REPORT_STORAGE_KEY, text);
  window.localStorage.setItem(REPORT_STORAGE_KEY, text);
}

export function loadReport(): StoredReport | null {
  const text =
    window.sessionStorage.getItem(REPORT_STORAGE_KEY) ??
    window.localStorage.getItem(REPORT_STORAGE_KEY);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as StoredReport;
    if (!parsed || !Array.isArray(parsed.scenarios) || !Array.isArray(parsed.results)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function downloadText(filename: string, contents: string, type: string): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
