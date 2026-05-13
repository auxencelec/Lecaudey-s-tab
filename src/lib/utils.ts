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

export const CATEGORIES = [
  { value: "argent_de_poche", label: "Argent de poche", emoji: "💶" },
  { value: "vacances", label: "Vacances", emoji: "🏖️" },
  { value: "loyer", label: "Loyer", emoji: "🏠" },
  { value: "transport", label: "Transport / billets", emoji: "🚆" },
  { value: "cadeau", label: "Cadeau", emoji: "🎁" },
  { value: "avance", label: "Avance", emoji: "↩️" },
  { value: "remboursement", label: "Remboursement", emoji: "✅" },
  { value: "autre", label: "Autre", emoji: "📌" },
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
