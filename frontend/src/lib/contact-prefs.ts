/**
 * Per-contact localStorage preferences.
 * Stores: currency, tax_inclusive
 * Payment terms come from backend Contact.default_payment_terms.
 * Payment method is always manual (no caching).
 */

interface ContactPrefs {
  currency?: string
  tax_inclusive?: boolean
}

const KEY_PREFIX = "contact_prefs_"

export function getContactPrefs(contactId: string): ContactPrefs {
  try {
    return JSON.parse(localStorage.getItem(`${KEY_PREFIX}${contactId}`) || "{}")
  } catch {
    return {}
  }
}

export function saveContactPref(contactId: string, key: keyof ContactPrefs, value: string | boolean) {
  const prefs = getContactPrefs(contactId)
  prefs[key] = value as any
  localStorage.setItem(`${KEY_PREFIX}${contactId}`, JSON.stringify(prefs))
}

/**
 * Call when a contact is selected. Returns the fields to auto-populate.
 * `contact` is the full contact object from the API (with billing/shipping address fields + default_payment_terms).
 */
export function getAutoPopulateFields(contact: any, contactId: string) {
  const prefs = getContactPrefs(contactId)
  return {
    // From backend contact
    billing_address_line1: contact.billing_address_line1 ?? "",
    billing_address_line2: contact.billing_address_line2 ?? "",
    billing_city: contact.billing_city ?? "",
    billing_state: contact.billing_state ?? "",
    billing_postcode: contact.billing_postcode ?? "",
    billing_country: contact.billing_country ?? "",
    shipping_address_line1: contact.shipping_address_line1 ?? "",
    shipping_address_line2: contact.shipping_address_line2 ?? "",
    shipping_city: contact.shipping_city ?? "",
    shipping_state: contact.shipping_state ?? "",
    shipping_postcode: contact.shipping_postcode ?? "",
    shipping_country: contact.shipping_country ?? "",
    // Payment terms from backend
    payment_terms: contact.default_payment_terms ?? null,
    // Currency + tax_inclusive from localStorage
    currency: prefs.currency ?? null,
    tax_inclusive: prefs.tax_inclusive ?? null,
  }
}
