import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(amount: number, currency: string, locale = "fr-FR") {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/**
 * Emoji policy in this app:
 *   1. Category emojis  — only on transaction rows / category labels (this list).
 *   2. Avatar emojis    — only as user identity fallback when no photo.
 *   3. Empty-state mark — 📭 (one and only).
 * Everything else should be SVG icons or pure text. Don't sprinkle decorative
 * emojis on buttons, status messages, or banners.
 */
export const CATEGORIES = [
  { value: "argent_de_poche", label: "Argent de poche", emoji: "💶", color: "#10b981" },
  { value: "vacances", label: "Vacances", emoji: "🏖️", color: "#06b6d4" },
  { value: "loyer", label: "Loyer", emoji: "🏠", color: "#6366f1" },
  { value: "transport", label: "Transport / billets", emoji: "🚆", color: "#8b5cf6" },
  { value: "cadeau", label: "Cadeau", emoji: "🎁", color: "#ec4899" },
  { value: "avance", label: "Avance", emoji: "↩️", color: "#f59e0b" },
  { value: "remboursement", label: "Remboursement", emoji: "✅", color: "#22c55e" },
  { value: "autre", label: "Autre", emoji: "📌", color: "#64748b" },
] as const;

export type Category = (typeof CATEGORIES)[number]["value"];

export const CATEGORY_MAP: Record<string, { label: string; emoji: string }> =
  Object.fromEntries(CATEGORIES.map((c) => [c.value, { label: c.label, emoji: c.emoji }]));

export const SUPPORTED_CURRENCIES = [
  "EUR",
  "USD",
  "GBP",
  "CHF",
  "CAD",
  "JPY",
  "AUD",
  "SEK",
  "NOK",
  "DKK",
  "SGD",
  "HKD",
  "BRL",
  "MXN",
] as const;

export type Currency = (typeof SUPPORTED_CURRENCIES)[number];
