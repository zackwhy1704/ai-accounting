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
  | "shared_documents"    // sme/client: manage documents shared with their accountant
  | "my_accountants"      // sme/client: manage linked accounting firms
  | "firm_clients"        // firm: manage linked client orgs + invite
  | "client_dashboard"    // accountant-only: manage clients
  | "bank"
  | "contacts"
  | "products"
  | "stocks"
  | "reports"
  | "accounting"
  | "myinvois"          // MY only: LHDN e-invoice
  | "sg_compliance"     // SG only: IRAS / MAS e-invoice
  | "ai_assistant"
  | "billing"
  | "settings"

/**
 * Base feature lists per org_type.
 * Country-specific compliance modules (myinvois / sg_compliance) are injected
 * at runtime by getFeaturesForUser() based on org country.
 */
const ORG_FEATURES: Record<string, Feature[]> = {
  firm: [
    "dashboard",
    "shared_with_me",
    "client_dashboard",
    "firm_clients",
    "sales",
    "purchases",
    "upload_documents",
    "bank",
    "contacts",
    "products",
    "stocks",
    "reports",
    "accounting",
    "ai_assistant",
    "billing",
    "settings",
  ],
  sme: [
    "dashboard",
    "sales",
    "purchases",
    "upload_documents",
    "shared_documents",
    "my_accountants",
    "bank",
    "contacts",
    "products",
    "stocks",
    "reports",
    "accounting",
    "ai_assistant",
    "billing",
    "settings",
  ],
  individual: [
    "dashboard",
    "sales",
    "purchases",
    "upload_documents",
    "shared_documents",
    "my_accountants",
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
    "shared_documents",
    "my_accountants",
    "bank",
    "contacts",
    "reports",
    "accounting",
    "billing",
    "settings",
  ],
}

/** org_types that get compliance modules (exclude basic roles that don't file taxes) */
const COMPLIANCE_ORG_TYPES = new Set(["firm", "sme", "individual"])

/** Return enabled features for a given org_type + country combination. */
export function getFeaturesForUser(orgType: string, country: string): Set<Feature> {
  const list = [...(ORG_FEATURES[orgType] ?? ORG_FEATURES["sme"])]

  if (COMPLIANCE_ORG_TYPES.has(orgType)) {
    if (country === "SG") {
      list.push("sg_compliance")
    } else if (country === "MY") {
      list.push("myinvois")
    }
    // Other countries: neither module shown until supported
  }

  return new Set(list)
}

import { useAuth } from './auth'

export function useFeatureFlags() {
  const { user } = useAuth()
  const features = getFeaturesForUser(user?.org_type ?? 'sme', user?.country ?? '')
  return {
    has: (f: Feature) => features.has(f),
    features,
  }
}
