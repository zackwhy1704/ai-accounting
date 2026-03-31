import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { useAuth } from './lib/auth'
import { useUserOrganizations } from './lib/hooks'
import LoginPage from './pages/auth/LoginPage'
import OnboardingPage from './pages/auth/OnboardingPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import InvoicesPage from './pages/invoices/InvoicesPage'
import QuotationsPage from './pages/sales/quotations/QuotationsPage'
import NewQuotationPage from './pages/sales/quotations/NewQuotationPage'
import SalesOrdersPage from './pages/sales/orders/SalesOrdersPage'
import NewSalesOrderPage from './pages/sales/orders/NewSalesOrderPage'
import DeliveryOrdersPage from './pages/sales/delivery-orders/DeliveryOrdersPage'
import NewDeliveryOrderPage from './pages/sales/delivery-orders/NewDeliveryOrderPage'
import NewInvoicePage from './pages/sales/invoices/NewInvoicePage'
import CreditNotesPage from './pages/sales/credit-notes/CreditNotesPage'
import NewCreditNotePage from './pages/sales/credit-notes/NewCreditNotePage'
import DebitNotesPage from './pages/sales/debit-notes/DebitNotesPage'
import NewDebitNotePage from './pages/sales/debit-notes/NewDebitNotePage'
import PaymentsPage from './pages/sales/payments/PaymentsPage'
import NewPaymentPage from './pages/sales/payments/NewPaymentPage'
import RefundsPage from './pages/sales/refunds/RefundsPage'
import NewRefundPage from './pages/sales/refunds/NewRefundPage'
import BillsPage from './pages/bills/BillsPage'
import ContactsPage from './pages/contacts/ContactsPage'
import DocumentsPage from './pages/documents/DocumentsPage'
import AccountingPage from './pages/accounting/AccountingPage'
import BillingPage from './pages/billing/BillingPage'
import AIAssistantPage from './pages/ai-assistant/AIAssistantPage'
import SettingsPage from './pages/settings/SettingsPage'
import GenericPage from './pages/GenericPage'
import FirmSettingsPage from './pages/firm/FirmSettingsPage'
import PracticeDashboardPage from './pages/firm/PracticeDashboardPage'
import ClientPortalPage from './pages/firm/ClientPortalPage'
import AcceptInvitePage from './pages/firm/AcceptInvitePage'
import PayPage from './pages/public/PayPage'
import ProductsPage from './pages/products/ProductsPage'
import RecurringInvoicesPage from './pages/sales/recurring/RecurringInvoicesPage'
import VendorCreditsPage from './pages/purchases/VendorCreditsPage'
import SaleReceiptsPage from './pages/sales/receipts/SaleReceiptsPage'
import BankRulesPage from './pages/bank/BankRulesPage'
import ManualJournalsPage from './pages/accounting/ManualJournalsPage'
import NewManualJournalPage from './pages/accounting/NewManualJournalPage'
import NewProductPage from './pages/products/NewProductPage'

function ProtectedRoute({ children, allowOnboarding }: { children: React.ReactNode; allowOnboarding?: boolean }) {
  const { token, isLoading, onboardingCompleted } = useAuth()
  if (isLoading) return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading...</div>
  if (!token) return <Navigate to="/login" replace />
  // Redirect to onboarding if not completed (except on the onboarding page itself)
  if (!allowOnboarding && onboardingCompleted === false) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

function SmartRedirect() {
  const { user } = useAuth()
  const { data: orgs } = useUserOrganizations()
  const currentOrg = orgs?.find(o => o.organization_id === user?.organization_id)
  if (currentOrg?.org_type === 'firm') return <Navigate to="/firm/dashboard" replace />
  return <Navigate to="/dashboard" replace />
}

function App() {
  return (
    <Routes>
      {/* Client portal — public, outside auth */}
      <Route path="/p/:slug" element={<ClientPortalPage />} />
      <Route path="/p/:slug/invite/:token" element={<AcceptInvitePage />} />
      <Route path="/pay/:token" element={<PayPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/onboarding" element={<ProtectedRoute allowOnboarding><OnboardingPage /></ProtectedRoute>} />
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/" element={<SmartRedirect />} />
        <Route path="/dashboard" element={<DashboardPage />} />

        {/* Sales */}
        <Route path="/sales/quotations" element={<QuotationsPage />} />
        <Route path="/sales/quotations/new" element={<NewQuotationPage />} />
        <Route path="/sales/orders" element={<SalesOrdersPage />} />
        <Route path="/sales/orders/new" element={<NewSalesOrderPage />} />
        <Route path="/sales/delivery-orders" element={<DeliveryOrdersPage />} />
        <Route path="/sales/delivery-orders/new" element={<NewDeliveryOrderPage />} />
        <Route path="/sales/invoices" element={<InvoicesPage />} />
        <Route path="/sales/invoices/new" element={<NewInvoicePage />} />
        <Route path="/sales/credit-notes" element={<CreditNotesPage />} />
        <Route path="/sales/credit-notes/new" element={<NewCreditNotePage />} />
        <Route path="/sales/debit-notes" element={<DebitNotesPage />} />
        <Route path="/sales/debit-notes/new" element={<NewDebitNotePage />} />
        <Route path="/sales/payments" element={<PaymentsPage />} />
        <Route path="/sales/payments/new" element={<NewPaymentPage />} />
        <Route path="/sales/refunds" element={<RefundsPage />} />
        <Route path="/sales/refunds/new" element={<NewRefundPage />} />
        <Route path="/sales/recurring" element={<RecurringInvoicesPage />} />
        <Route path="/sales/receipts" element={<SaleReceiptsPage />} />
        <Route path="/accounting/journals" element={<ManualJournalsPage />} />
        <Route path="/accounting/journals/new" element={<NewManualJournalPage />} />

        {/* Purchases */}
        <Route path="/purchases/bills" element={<BillsPage />} />
        <Route path="/purchases/purchase-orders" element={<GenericPage title="Purchase Orders" category="Purchases" />} />
        <Route path="/purchases/goods-received-notes" element={<GenericPage title="Goods Received Notes" category="Purchases" />} />
        <Route path="/purchases/credit-notes" element={<GenericPage title="Credit Notes" category="Purchases" />} />
        <Route path="/purchases/vendor-credits" element={<VendorCreditsPage />} />
        <Route path="/purchases/payments" element={<GenericPage title="Payments" category="Purchases" />} />
        <Route path="/purchases/refunds" element={<GenericPage title="Refunds" category="Purchases" />} />

        {/* Upload */}
        <Route path="/upload" element={<DocumentsPage />} />

        {/* Bank */}
        <Route path="/bank/money-in" element={<GenericPage title="Money In" category="Bank" />} />
        <Route path="/bank/money-out" element={<GenericPage title="Money Out" category="Bank" />} />
        <Route path="/bank/transfers" element={<GenericPage title="Transfers" category="Bank" />} />
        <Route path="/bank/accounts" element={<GenericPage title="Bank Accounts" category="Bank" />} />
        <Route path="/bank/rules" element={<BankRulesPage />} />

        {/* Other */}
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/new" element={<NewProductPage />} />
        <Route path="/stocks" element={<GenericPage title="Stocks" category="Inventory" />} />
        <Route path="/reports" element={<GenericPage title="Reports" category="Analytics" />} />
        <Route path="/accounting" element={<AccountingPage />} />
        <Route path="/ai-assistant" element={<AIAssistantPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/settings" element={<SettingsPage />} />

        {/* Firm / Practice */}
        <Route path="/firm/settings" element={<FirmSettingsPage />} />
        <Route path="/firm/dashboard" element={<PracticeDashboardPage />} />

        {/* Catch-all: redirect unknown routes to dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}

export default App
