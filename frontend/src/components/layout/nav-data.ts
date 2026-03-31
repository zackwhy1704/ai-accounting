import type { NavIcon } from "./icons"
import type { TranslationKey } from "../../lib/i18n"

export type NavChildItem = { labelKey: TranslationKey; href: string }
export type NavItem = {
  labelKey: TranslationKey
  href: string
  icon: NavIcon
  children?: NavChildItem[]
}

export const navItems: NavItem[] = [
  { labelKey: "nav.dashboard", href: "/dashboard", icon: "layout-dashboard" },
  {
    labelKey: "nav.sales",
    href: "/sales",
    icon: "receipt",
    children: [
      { labelKey: "nav.quotations", href: "/sales/quotations" },
      { labelKey: "nav.saleOrders", href: "/sales/orders" },
      { labelKey: "nav.deliveryOrders", href: "/sales/delivery-orders" },
      { labelKey: "nav.invoices", href: "/sales/invoices" },
      { labelKey: "nav.creditNotes", href: "/sales/credit-notes" },
      { labelKey: "nav.debitNotes", href: "/sales/debit-notes" },
      { labelKey: "nav.payments", href: "/sales/payments" },
      { labelKey: "nav.refunds", href: "/sales/refunds" },
      { labelKey: "nav.saleReceipts", href: "/sales/receipts" },
      { labelKey: "nav.recurringInvoices", href: "/sales/recurring" },
    ],
  },
  {
    labelKey: "nav.purchases",
    href: "/purchases",
    icon: "shopping-cart",
    children: [
      { labelKey: "nav.purchaseOrders", href: "/purchases/purchase-orders" },
      { labelKey: "nav.goodsReceivedNotes", href: "/purchases/goods-received-notes" },
      { labelKey: "nav.bills", href: "/purchases/bills" },
      { labelKey: "nav.purchaseCreditNotes", href: "/purchases/credit-notes" },
      { labelKey: "nav.vendorCredits", href: "/purchases/vendor-credits" },
      { labelKey: "nav.purchasePayments", href: "/purchases/payments" },
      { labelKey: "nav.purchaseRefunds", href: "/purchases/refunds" },
    ],
  },
  { labelKey: "nav.uploadDocuments", href: "/upload", icon: "upload" },
  { labelKey: "nav.sharedWithMe", href: "/shared-with-me", icon: "share-2" },
  {
    labelKey: "nav.bank",
    href: "/bank",
    icon: "landmark",
    children: [
      { labelKey: "nav.accounts", href: "/bank/accounts" },
      { labelKey: "nav.moneyIn", href: "/bank/money-in" },
      { labelKey: "nav.moneyOut", href: "/bank/money-out" },
      { labelKey: "nav.transfers", href: "/bank/transfers" },
      { labelKey: "nav.bankRules", href: "/bank/rules" },
    ],
  },
  {
    labelKey: "nav.contacts",
    href: "/contacts",
    icon: "users",
    children: [
      { labelKey: "nav.contacts", href: "/contacts" },
      { labelKey: "nav.contactGroups", href: "/contacts/groups" },
    ],
  },
  { labelKey: "nav.productsServices", href: "/products", icon: "package" },
  {
    labelKey: "nav.stocks",
    href: "/stocks",
    icon: "boxes",
    children: [
      { labelKey: "nav.stockAdjustments", href: "/stock/adjustments" },
      { labelKey: "nav.stockTransfers", href: "/stock/transfers" },
      { labelKey: "nav.stockValues", href: "/stock/values" },
    ],
  },
  { labelKey: "nav.reports", href: "/reports", icon: "bar-chart" },
  {
    labelKey: "nav.accounting",
    href: "/accounting",
    icon: "calculator",
    children: [
      { labelKey: "nav.chartOfAccounts", href: "/accounting/accounts" },
      { labelKey: "nav.manualJournals", href: "/accounting/journals" },
      { labelKey: "nav.fixedAssets", href: "/accounting/fixed-assets" },
    ],
  },
  { labelKey: "nav.myInvois", href: "/myinvois", icon: "file-chart" },
  { labelKey: "nav.aiAssistant", href: "/ai-assistant", icon: "bot" },
  { labelKey: "nav.billing", href: "/billing", icon: "credit-card" },
  {
    labelKey: "nav.firmDashboard",
    href: "/firm",
    icon: "briefcase",
    children: [
      { labelKey: "nav.firmDashboard", href: "/firm/dashboard" },
      { labelKey: "nav.firmSettings", href: "/firm/settings" },
    ],
  },
  {
    labelKey: "nav.controlPanel",
    href: "/settings",
    icon: "settings",
    children: [
      { labelKey: "nav.companySettings", href: "/settings/company" },
      { labelKey: "nav.invoiceTemplates", href: "/settings/invoice-templates" },
      { labelKey: "nav.customFields", href: "/settings/custom-fields" },
    ],
  },
]
