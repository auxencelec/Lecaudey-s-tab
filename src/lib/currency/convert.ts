/**
 * Currency conversion using the Frankfurter API (free, no API key).
 * Rates are cached in memory for 1 hour per (date, base) pair.
 */

const FRANKFURTER_BASE = "https://api.frankfurter.dev/v1";
const ONE_HOUR = 60 * 60 * 1000;

type RateMap = Record<string, number>;
type CacheEntry = { rates: RateMap; fetchedAt: number };

const cache = new Map<string, CacheEntry>();

async function fetchRates(base: string): Promise<RateMap> {
  const key = `latest:${base}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < ONE_HOUR) return hit.rates;

  const res = await fetch(`${FRANKFURTER_BASE}/latest?base=${base}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`Frankfurter ${res.status}`);
  const json = (await res.json()) as { rates: RateMap; base: string };
  const rates = { ...json.rates, [base]: 1 };
  cache.set(key, { rates, fetchedAt: Date.now() });
  return rates;
}

export async function convert(
  amount: number,
  from: string,
  to: string
): Promise<number> {
  if (from === to) return amount;
  try {
    const rates = await fetchRates(from);
    const rate = rates[to];
    if (!rate) return amount; // unsupported target — return as-is
    return amount * rate;
  } catch {
    return amount; // network failure — fail gracefully
  }
}

export async function convertMany(
  items: { amount: number; currency: string }[],
  to: string
): Promise<number> {
  const total = await Promise.all(items.map((i) => convert(i.amount, i.currency, to)));
  return total.reduce((s, v) => s + v, 0);
}
