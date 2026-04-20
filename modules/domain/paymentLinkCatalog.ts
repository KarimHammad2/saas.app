/**
 * Fixed Stripe Billing checkout URLs for SaaS² platform tiers (USD and CAD).
 *
 * Selection rule: **floor** — largest catalog amount ≤ purchase total
 * (`hoursPurchased * hourlyRate`). If total is below every tier (e.g. &lt; $50),
 * use the **smallest** tier so a link is always present.
 */

export interface PaymentTierLink {
  amount: number;
  url: string;
}

const PAY_BASE = "https://pay.saassquared.com/b/";

/** USD tiers, ascending by amount (unique URLs). */
export const USD_PAYMENT_LINK_CATALOG: PaymentTierLink[] = [
  { amount: 50, url: `${PAY_BASE}00w5kE2NOe2wfQu3B0gEg14` },
  { amount: 100, url: `${PAY_BASE}3cI8wQcoogaE1ZEfjIgEg12` },
  { amount: 250, url: `${PAY_BASE}bJe00k9cc2jO8o2fjIgEg11` },
  { amount: 500, url: `${PAY_BASE}aFadRa9ccgaE5bQ8VkgEg0Z` },
  { amount: 750, url: `${PAY_BASE}5kQeVe744e2w7jY6NcgEg0X` },
  { amount: 1000, url: `${PAY_BASE}7sY8wQ1JKf6A6fUdbAgEg0V` },
  { amount: 1250, url: `${PAY_BASE}cNiaEYbkkaQkdIm6NcgEg0T` },
  { amount: 1500, url: `${PAY_BASE}aFaaEYdss0bGcEi2wWgEg0R` },
  { amount: 1750, url: `${PAY_BASE}7sYcN6coo9MgeMq2wWgEg0P` },
  { amount: 2000, url: `${PAY_BASE}dRm9AUagge2w47Mc7wgEg0N` },
  { amount: 2250, url: `${PAY_BASE}aFa6oI3RSe2w6fU9ZogEg0L` },
  { amount: 2500, url: `${PAY_BASE}00w8wQcoo4rWbAe2wWgEg0J` },
  { amount: 2750, url: `${PAY_BASE}dRm00k2NO5w033I3B0gEg0H` },
  { amount: 3000, url: `${PAY_BASE}28EbJ21JKgaEgUy4F4gEg0F` },
  { amount: 3250, url: `${PAY_BASE}8x28wQ4VWcYs1ZE4F4gEg0D` },
  { amount: 3500, url: `${PAY_BASE}cNi3cwaggcYs5bQ7RggEg0B` },
  { amount: 3750, url: `${PAY_BASE}fZufZi1JK0bG9s6c7wgEg0z` },
  { amount: 4000, url: `${PAY_BASE}3cI4gAfAA6A4awa6NcgEg0x` },
  { amount: 4250, url: `${PAY_BASE}dRmeVe4VWgaEgUyfjIgEg0v` },
  { amount: 4500, url: `${PAY_BASE}14A3cw4VW6A48o23B0gEg0t` },
  { amount: 4750, url: `${PAY_BASE}7sY3cw0FGgaE33IgnMgEg0r` },
  { amount: 5000, url: `${PAY_BASE}cNi4gAdssaQk1ZE7RggEg0p` },
  { amount: 5500, url: `${PAY_BASE}9B6dRa4VWcYsgUydbAgEg0n` },
  { amount: 6000, url: `${PAY_BASE}00w9AUgEEbUogUyb3sgEg0l` },
  { amount: 6500, url: `${PAY_BASE}00w4gAdss2jO8o2b3sgEg0j` },
  { amount: 7000, url: `${PAY_BASE}dRm7sMdss6A433I5J8gEg0h` },
  { amount: 8000, url: `${PAY_BASE}dRm28s888f6AawaefEgEg0f` },
  { amount: 8500, url: `${PAY_BASE}14AdRa888cYscEignMgEg0d` },
  { amount: 9000, url: `${PAY_BASE}00w6oIgEEbUoeMqc7wgEg0b` },
  { amount: 9500, url: `${PAY_BASE}9B600kgEE7E86fU3B0gEg09` },
  { amount: 10000, url: `${PAY_BASE}28E9AUcoo7E8awac7wgEg07` },
  { amount: 15000, url: `${PAY_BASE}dRm28sdss3nS47M2wWgEg05` },
  { amount: 20000, url: `${PAY_BASE}5kQaEY3RS0bG6fU0oOgEg03` },
  { amount: 30000, url: `${PAY_BASE}3cI8wQ2NOgaEfQu4F4gEg01` },
];

/** CAD tiers (ascending by amount); used when the Transaction rate line indicates CAD. */
export const CAD_PAYMENT_LINK_CATALOG: PaymentTierLink[] = [
  { amount: 50, url: `${PAY_BASE}7sY14ofAA0bG0VA7RggEg13` },
  { amount: 100, url: `${PAY_BASE}3cI8wQcoogaE1ZEfjIgEg12` },
  { amount: 250, url: `${PAY_BASE}5kQeVecoogaEbAefjIgEg10` },
  { amount: 500, url: `${PAY_BASE}6oU9AUagg4rWbAe1sSgEg0Y` },
  { amount: 750, url: `${PAY_BASE}9B67sM744aQk7jY5J8gEg0W` },
  { amount: 1000, url: `${PAY_BASE}9B6bJ2aggcYs6fU0oOgEg0U` },
  { amount: 1250, url: `${PAY_BASE}8x2cN6fAA1fK7jY3B0gEg0S` },
  { amount: 1500, url: `${PAY_BASE}dRmcN61JKgaE9s6fjIgEg0Q` },
  { amount: 1750, url: `${PAY_BASE}cNi8wQ4VW9Mg6fU4F4gEg0O` },
  { amount: 2000, url: `${PAY_BASE}00w9AU3RSf6Aawa3B0gEg0M` },
  { amount: 2250, url: `${PAY_BASE}eVq7sM9ccf6A7jY3B0gEg0K` },
  { amount: 2500, url: `${PAY_BASE}eVqcN66007E88o2fjIgEg0I` },
  { amount: 2750, url: `${PAY_BASE}28E14obkk0bG5bQc7wgEg0G` },
  { amount: 3000, url: `${PAY_BASE}4gMcN60FG6A45bQ3B0gEg0E` },
  { amount: 3250, url: `${PAY_BASE}cNi6oIeww3nSbAec7wgEg0C` },
  { amount: 3500, url: `${PAY_BASE}4gMdRa0FG6A4eMq7RggEg0A` },
  { amount: 3750, url: `${PAY_BASE}9B628sgEE1fKfQu8VkgEg0y` },
  { amount: 4000, url: `${PAY_BASE}5kQbJ20FG4rW47M9ZogEg0w` },
  { amount: 4250, url: `${PAY_BASE}4gM8wQewwe2wfQu6NcgEg0u` },
  { amount: 4500, url: `${PAY_BASE}00wcN60FG6A40VAfjIgEg0s` },
  { amount: 4750, url: `${PAY_BASE}5kQdRacoo4rWcEi4F4gEg0q` },
  { amount: 5000, url: `${PAY_BASE}dRm00kbkk5w00VA7RggEg0o` },
  { amount: 5500, url: `${PAY_BASE}eVqeVe2NO2jOdImgnMgEg0m` },
  { amount: 6000, url: `${PAY_BASE}3cI7sMdss6A4cEic7wgEg0k` },
  { amount: 6500, url: `${PAY_BASE}cNicN62NObUo0VAgnMgEg0i` },
  { amount: 7500, url: `${PAY_BASE}cNi4gAbkk5w0dIm4F4gEg0g` },
  { amount: 8000, url: `${PAY_BASE}00w28s9cc3nS6fUefEgEg0e` },
  { amount: 8500, url: `${PAY_BASE}eVq28sgEE1fKeMq5J8gEg0c` },
  { amount: 9000, url: `${PAY_BASE}00w6oIgEEbUoeMqc7wgEg0b` },
  { amount: 9500, url: `${PAY_BASE}cNi5kE3RS1fK9s62wWgEg08` },
  { amount: 10000, url: `${PAY_BASE}cNi4gAgEE1fK9s6b3sgEg06` },
  { amount: 15000, url: `${PAY_BASE}28E5kEcoo2jOcEi1sSgEg04` },
  { amount: 20000, url: `${PAY_BASE}7sYdRaaggaQkfQufjIgEg02` },
  { amount: 30000, url: `${PAY_BASE}28EdRacoo9MgfQufjIgEg00` },
];

export interface ResolvedPaymentLink {
  url: string;
  tierAmount: number;
  currency: "usd" | "cad";
}

function clampNonNegative(n: number): number {
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

/**
 * Floor tier: max catalog amount ≤ total. If none (total below minimum tier), use smallest tier.
 */
function resolvePaymentLinkFromCatalog(
  catalog: PaymentTierLink[],
  total: number,
  currency: ResolvedPaymentLink["currency"],
): ResolvedPaymentLink {
  const t = clampNonNegative(total);
  if (catalog.length === 0) {
    throw new Error(`${currency.toUpperCase()} payment link catalog is empty.`);
  }
  let best: PaymentTierLink | null = null;
  for (const tier of catalog) {
    if (tier.amount <= t && (!best || tier.amount > best.amount)) {
      best = tier;
    }
  }
  const chosen = best ?? catalog[0];
  return { url: chosen.url, tierAmount: chosen.amount, currency };
}

export function resolveUsdPaymentLinkForTotal(total: number): ResolvedPaymentLink {
  return resolvePaymentLinkFromCatalog(USD_PAYMENT_LINK_CATALOG, total, "usd");
}

export function resolveCadPaymentLinkForTotal(total: number): ResolvedPaymentLink {
  return resolvePaymentLinkFromCatalog(CAD_PAYMENT_LINK_CATALOG, total, "cad");
}

export function resolvePaymentLinkForTotal(
  total: number,
  currency: "usd" | "cad",
): ResolvedPaymentLink {
  return currency === "cad"
    ? resolveCadPaymentLinkForTotal(total)
    : resolveUsdPaymentLinkForTotal(total);
}
