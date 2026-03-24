/**
 * Stripe client singleton for PACE Platform.
 * ADR-010 準拠: secret key はサーバーサイドのみで使用。
 */
import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not set");
  }
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      typescript: true,
    });
  }
  return _stripe;
}

/**
 * Plan ID マッピング
 * 環境変数で注入（ADR-010: Price IDをハードコード禁止）
 */
export function getPlanPriceId(plan: "pro" | "standard" | "enterprise"): string {
  const map: Record<string, string | undefined> = {
    pro: process.env.STRIPE_PRO_PRICE_ID,
    standard: process.env.STRIPE_STANDARD_PRICE_ID,
    enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID,
  };
  const id = map[plan];
  if (!id) throw new Error(`Price ID for plan "${plan}" is not configured`);
  return id;
}

/** CV解析アドオンの Stripe Price ID */
export function getCvAddonPriceId(): string {
  const id = process.env.STRIPE_CV_ADDON_PRICE_ID;
  if (!id) throw new Error("STRIPE_CV_ADDON_PRICE_ID is not set");
  return id;
}

/** Enterprise プランの Stripe Price ID */
export function getEnterprisePriceId(): string {
  const id = process.env.STRIPE_ENTERPRISE_PRICE_ID;
  if (!id) throw new Error("STRIPE_ENTERPRISE_PRICE_ID is not set");
  return id;
}

/**
 * Stripe Webhook シークレット
 */
export function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
  return secret;
}
