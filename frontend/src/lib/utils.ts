import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatCurrency = (value: number | null | undefined, currency: string = "MYR") => {
  const prefix = currency === "MYR" ? "RM" : currency === "SGD" ? "S$" : "$";
  const num = value ?? 0;
  return `${prefix} ${num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
};

export const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString("en-MY", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

/** Download a CSV string as a file */
export function downloadCSV(filename: string, rows: string[][]) {
  const csv = rows
    .map(row => row.map(cell => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n")
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Print the current page (browser print dialog, user can save as PDF) */
export function printReport() {
  window.print()
}

/** Download any report as a styled Excel workbook via the backend exporter. */
export async function downloadXLSX(filename: string, title: string, headers: string[], rows: (string | number)[][]) {
  const api = (await import("./api")).default
  const res = await api.post(
    "/reports/export-xlsx",
    { filename, sheet_name: title.slice(0, 31), title, headers, rows },
    { responseType: "blob" },
  )
  const url = URL.createObjectURL(res.data as Blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${filename}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
