import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { useAuth } from './lib/auth'
import { useUserOrganizations } from './lib/hooks'
import LoginPage from './pages/auth/LoginPage'
import OnboardingPage from './pages/auth/OnboardingPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import InvoicesPage from './pages/invoices/InvoicesPage'
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
      <Route path="/login" element={<LoginPage />} />
      <Route path="/onboarding" element={<ProtectedRoute allowOnboarding><OnboardingPage /></ProtectedRoute>} />
      <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
        <Route path="/" element={<SmartRedirect />} />
        <Route path="/dashboard" element={<DashboardPage />} />

        {/* Sales */}
        <Route path="/sales/invoices" element={<InvoicesPage />} />
        <Route path="/sales/quotations" element={<GenericPage title="Quotations" category="Sales" />} />
        <Route path="/sales/delivery-orders" element={<GenericPage title="Delivery Orders" category="Sales" />} />
        <Route path="/sales/credit-notes" element={<GenericPage title="Credit Notes" category="Sales" />} />
        <Route path="/sales/payments" element={<GenericPage title="Payments" category="Sales" />} />
        <Route path="/sales/refunds" element={<GenericPage title="Refunds" category="Sales" />} />

        {/* Purchases */}
        <Route path="/purchases/bills" element={<BillsPage />} />
        <Route path="/purchases/purchase-orders" element={<GenericPage title="Purchase Orders" category="Purchases" />} />
        <Route path="/purchases/goods-received-notes" element={<GenericPage title="Goods Received Notes" category="Purchases" />} />
        <Route path="/purchases/credit-notes" element={<GenericPage title="Credit Notes" category="Purchases" />} />
        <Route path="/purchases/payments" element={<GenericPage title="Payments" category="Purchases" />} />
        <Route path="/purchases/refunds" element={<GenericPage title="Refunds" category="Purchases" />} />

        {/* Upload */}
        <Route path="/upload" element={<DocumentsPage />} />

        {/* Bank */}
        <Route path="/bank/money-in" element={<GenericPage title="Money In" category="Bank" />} />
        <Route path="/bank/money-out" element={<GenericPage title="Money Out" category="Bank" />} />
        <Route path="/bank/transfers" element={<GenericPage title="Transfers" category="Bank" />} />
        <Route path="/bank/accounts" element={<GenericPage title="Bank Accounts" category="Bank" />} />

        {/* Other */}
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/products" element={<GenericPage title="Products & Services" category="Inventory" />} />
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
