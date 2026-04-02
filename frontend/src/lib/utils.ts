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
