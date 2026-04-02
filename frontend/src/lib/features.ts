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
    // shared_documents + my_accountants are NOT included by default —
    // they are added dynamically in useFeatureFlags() only when the org
    // has at least one confirmed linked accountant firm.
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
import { useQuery } from '@tanstack/react-query'
import api from './api'

const SME_TYPES = new Set(["sme", "individual", "freelancer"])

export function useFeatureFlags() {
  const { user } = useAuth()
  const isSME = SME_TYPES.has(user?.org_type ?? "")

  const { data: linkedFirms = [], isLoading: linksLoading } = useQuery<{ link_id: string }[]>({
    queryKey: ["my-links-count"],
    queryFn: () => api.get("/invitations/my-links").then(r => r.data),
    enabled: !!user && isSME,
    staleTime: 60_000,
  })

  const features = getFeaturesForUser(user?.org_type ?? 'sme', user?.country ?? '')

  // my_accountants is always visible for SME types so they can discover and initiate
  // linking to an accountant firm (not just wait for a firm invitation).
  // shared_documents is only unlocked once at least one firm is linked — no point
  // showing a document sharing screen with no one to share to.
  if (isSME) {
    features.add("my_accountants")
  }
  if (isSME && !linksLoading && linkedFirms.length > 0) {
    features.add("shared_documents")
  }

  // Portal clients (signed up under a firm's white-label link) have parent_firm_id set.
  // For these orgs: hide billing (firm owns billing), shared documents, and my accountants
  // (they are already permanently linked to one firm — no need to manage that).
  if (user?.parent_firm_id) {
    features.delete("billing")
    features.delete("shared_documents")
    features.delete("my_accountants")
  }

  // Firm-type orgs: hide "Shared with Me" — they access client documents via the
  // Clients module instead (Xero-style drill-through).
  if (user?.org_type === "firm") {
    features.delete("shared_with_me")
  }

  return {
    has: (f: Feature) => features.has(f),
    features,
  }
}
