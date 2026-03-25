import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const formatCurrency = (value: number, currency: string = "MYR") => {
  const prefix = currency === "MYR" ? "RM" : currency === "SGD" ? "S$" : "$";
  return `${prefix} ${value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
};

export const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString("en-MY", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};
