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
      { labelKey: "nav.creditNotes", href: "/purchases/credit-notes" },
      { labelKey: "nav.payments", href: "/purchases/payments" },
      { labelKey: "nav.refunds", href: "/purchases/refunds" },
    ],
  },
  { labelKey: "nav.uploadDocuments", href: "/upload", icon: "upload" },
  {
    labelKey: "nav.bank",
    href: "/bank",
    icon: "landmark",
    children: [
      { labelKey: "nav.moneyIn", href: "/bank/money-in" },
      { labelKey: "nav.moneyOut", href: "/bank/money-out" },
      { labelKey: "nav.transfers", href: "/bank/transfers" },
      { labelKey: "nav.accounts", href: "/bank/accounts" },
    ],
  },
  { labelKey: "nav.contacts", href: "/contacts", icon: "users" },
  { labelKey: "nav.productsServices", href: "/products", icon: "package" },
  { labelKey: "nav.stocks", href: "/stocks", icon: "boxes" },
  { labelKey: "nav.reports", href: "/reports", icon: "bar-chart" },
  { labelKey: "nav.accounting", href: "/accounting", icon: "calculator" },
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
  { labelKey: "nav.controlPanel", href: "/settings", icon: "settings" },
]
