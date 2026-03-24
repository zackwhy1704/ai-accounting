import { Routes, Route } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { DashboardPage } from './pages/dashboard/DashboardPage'
import { InvoicesPage } from './pages/invoices/InvoicesPage'
import { BillsPage } from './pages/bills/BillsPage'
import { ContactsPage } from './pages/contacts/ContactsPage'
import { DocumentsPage } from './pages/documents/DocumentsPage'
import { AccountingPage } from './pages/accounting/AccountingPage'
import { ReportsPage } from './pages/reports/ReportsPage'
import { SettingsPage } from './pages/settings/SettingsPage'
import { BillingPage } from './pages/billing/BillingPage'
import { AIAssistantPage } from './pages/ai-assistant/AIAssistantPage'
import { LoginPage } from './pages/auth/LoginPage'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppLayout />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/bills" element={<BillsPage />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/accounting" element={<AccountingPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/ai-assistant" element={<AIAssistantPage />} />
      </Route>
    </Routes>
  )
}

export default App
