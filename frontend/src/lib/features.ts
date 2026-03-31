/**
 * Feature flag system.
 * Each feature key maps to which org_types and plans can access it.
 * Add plan tiers here when billing is wired up.
 *
 * Usage:
 *   const { has } = useFeatureFlags()
 *   if (!has("client_dashboard")) return <UpgradePrompt />
 */

export type Feature =
  | "dashboard"
  | "sales"
  | "purchases"
  | "upload_documents"
  | "shared_with_me"      // accountant-only: see documents clients shared
  | "client_dashboard"    // accountant-only: manage clients
  | "bank"
  | "contacts"
  | "products"
  | "stocks"
  | "reports"
  | "accounting"
  | "myinvois"
  | "ai_assistant"
  | "billing"
  | "settings"

/** Features available to each org_type (all plans). */
const ORG_FEATURES: Record<string, Feature[]> = {
  firm: [
    "dashboard",
    "shared_with_me",
    "client_dashboard",
    "sales",
    "purchases",
    "upload_documents",
    "bank",
    "contacts",
    "products",
    "stocks",
    "reports",
    "accounting",
    "myinvois",
    "ai_assistant",
    "billing",
    "settings",
  ],
  sme: [
    "dashboard",
    "sales",
    "purchases",
    "upload_documents",
    "bank",
    "contacts",
    "products",
    "stocks",
    "reports",
    "accounting",
    "myinvois",
    "ai_assistant",
    "billing",
    "settings",
  ],
  individual: [
    "dashboard",
    "sales",
    "purchases",
    "upload_documents",
    "bank",
    "contacts",
    "reports",
    "accounting",
    "billing",
    "settings",
  ],
  freelancer: [
    "dashboard",
    "sales",
    "upload_documents",
    "bank",
    "contacts",
    "reports",
    "accounting",
    "billing",
    "settings",
  ],
}

/** Return enabled features for a given org_type. Falls back to sme if unknown. */
export function getFeaturesForOrgType(orgType: string): Set<Feature> {
  const list = ORG_FEATURES[orgType] ?? ORG_FEATURES["sme"]
  return new Set(list)
}

import { useAuth } from './auth'

export function useFeatureFlags() {
  const { user } = useAuth()
  const features = getFeaturesForOrgType(user?.org_type ?? 'sme')
  return {
    has: (f: Feature) => features.has(f),
    features,
  }
}
