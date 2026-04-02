import { Routes, Route, Navigate } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { useAuth } from './lib/auth'
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
import NewContactPage from './pages/contacts/NewContactPage'
import DocumentsPage from './pages/documents/DocumentsPage'
import AccountingPage from './pages/accounting/AccountingPage'
import BillingPage from './pages/billing/BillingPage'
import AIAssistantPage from './pages/ai-assistant/AIAssistantPage'
import SettingsPage from './pages/settings/SettingsPage'
import FirmSettingsPage from './pages/firm/FirmSettingsPage'
import PracticeDashboardPage from './pages/firm/PracticeDashboardPage'
import ClientPortalPage from './pages/firm/ClientPortalPage'
import AcceptInvitePage from './pages/firm/AcceptInvitePage'
import PayPage from './pages/public/PayPage'
import ProductsPage from './pages/products/ProductsPage'
import RecurringInvoicesPage from './pages/sales/recurring/RecurringInvoicesPage'
import VendorCreditsPage from './pages/purchases/VendorCreditsPage'
import NewBillPage from './pages/purchases/NewBillPage'
import NewPurchaseOrderPage from './pages/purchases/NewPurchaseOrderPage'
import NewGoodsReceivedNotePage from './pages/purchases/NewGoodsReceivedNotePage'
import NewVendorCreditPage from './pages/purchases/NewVendorCreditPage'
import NewPurchasePaymentPage from './pages/purchases/NewPurchasePaymentPage'
import NewPurchaseRefundPage from './pages/purchases/NewPurchaseRefundPage'
import SaleReceiptsPage from './pages/sales/receipts/SaleReceiptsPage'
import NewSaleReceiptPage from './pages/sales/receipts/NewSaleReceiptPage'
import NewRecurringInvoicePage from './pages/sales/recurring/NewRecurringInvoicePage'
import BankRulesPage from './pages/bank/BankRulesPage'
import ManualJournalsPage from './pages/accounting/ManualJournalsPage'
import NewManualJournalPage from './pages/accounting/NewManualJournalPage'
import NewProductPage from './pages/products/NewProductPage'
import InvoiceTemplatesPage from './pages/settings/InvoiceTemplatesPage'
import CustomFieldsPage from './pages/settings/CustomFieldsPage'
import BankAccountsPage from './pages/bank/BankAccountsPage'
import NewBankAccountPage from './pages/bank/NewBankAccountPage'
import BankTransactionsPage from './pages/bank/BankTransactionsPage'
import NewBankTransactionPage from './pages/bank/NewBankTransactionPage'
import BankTransfersPage from './pages/bank/BankTransfersPage'
import NewBankTransferPage from './pages/bank/NewBankTransferPage'
import StockAdjustmentsPage from './pages/stock/StockAdjustmentsPage'
import NewStockAdjustmentPage from './pages/stock/NewStockAdjustmentPage'
import StockTransfersPage from './pages/stock/StockTransfersPage'
import NewStockTransferPage from './pages/stock/NewStockTransferPage'
import StockValuesPage from './pages/stock/StockValuesPage'
import PurchaseOrdersPage from './pages/purchases/PurchaseOrdersPage'
import GoodsReceivedNotesPage from './pages/purchases/GoodsReceivedNotesPage'
import PurchaseCreditNotesPage from './pages/purchases/PurchaseCreditNotesPage'
import PurchasePaymentsPage from './pages/purchases/PurchasePaymentsPage'
import PurchaseRefundsPage from './pages/purchases/PurchaseRefundsPage'
import ChartOfAccountsPage from './pages/accounting/ChartOfAccountsPage'
import FixedAssetsPage from './pages/accounting/FixedAssetsPage'
import NewFixedAssetPage from './pages/accounting/NewFixedAssetPage'
import AgedReceivablesPage from './pages/reports/AgedReceivablesPage'
import AgedPayablesPage from './pages/reports/AgedPayablesPage'
import TrialBalancePage from './pages/reports/TrialBalancePage'
import GeneralLedgerPage from './pages/reports/GeneralLedgerPage'
import SST02Page from './pages/reports/SST02Page'
import ReportsIndexPage from './pages/reports/ReportsIndexPage'
import TransactionListPage from './pages/reports/TransactionListPage'
import DebtorLedgerPage from './pages/reports/DebtorLedgerPage'
import CreditorLedgerPage from './pages/reports/CreditorLedgerPage'
import SSTSalesDetailPage from './pages/reports/SSTSalesDetailPage'
import SSTPurchaseDetailPage from './pages/reports/SSTPurchaseDetailPage'
import StockValuesReportPage from './pages/reports/StockValuesReportPage'
import InventorySummaryPage from './pages/reports/InventorySummaryPage'
import BankReconciliationPage from './pages/reports/BankReconciliationPage'
import ProfitLossPage from './pages/reports/ProfitLossPage'
import BalanceSheetPage from './pages/reports/BalanceSheetPage'
import CashFlowPage from './pages/reports/CashFlowPage'
import InvoiceSummaryPage from './pages/reports/InvoiceSummaryPage'
import BillSummaryPage from './pages/reports/BillSummaryPage'
import PaymentSummaryPage from './pages/reports/PaymentSummaryPage'
import ContactGroupsPage from './pages/contacts/ContactGroupsPage'
import CompanySettingsPage from './pages/settings/CompanySettingsPage'
import MyInvoisPage from './pages/myinvois/MyInvoisPage'
import SgCompliancePage from './pages/sg/SgCompliancePage'
import SharedDocumentsPage from './pages/documents/SharedDocumentsPage'
import SharedDocumentsOwnerPage from './pages/documents/SharedDocumentsOwnerPage'
import AcceptClientInvitePage from './pages/invitations/AcceptClientInvitePage'
import MyAccountantsPage from './pages/invitations/MyAccountantsPage'
import FirmClientsPage from './pages/firm/FirmClientsPage'

function ProtectedRoute({ children, allowOnboarding }: { children: React.ReactNode; allowOnboarding?: boolean }) {
  const { token, isLoading, onboardingCompleted } = useAuth()
  if (isLoading) return <div className="flex min-h-screen items-center justify-center text-slate-500">Loading...</div>
  if (!token) return <Navigate to="/login" replace />
  // Redirect to onboarding if not completed (except on the onboarding page itself)
  if (!allowOnboarding && onboardingCompleted === false) return <Navigate to="/onboarding" replace />
  return <>{children}</>
}

function SmartRedirect() {
  return <Navigate to="/dashboard" replace />
}

function App() {
  return (
    <Routes>
      {/* Client portal — public, outside auth */}
      <Route path="/p/:slug" element={<ClientPortalPage />} />
      <Route path="/p/:slug/invite/:token" element={<AcceptInvitePage />} />
      {/* Firm-client invite accept — requires login */}
      <Route path="/accept-client-invite" element={<AcceptClientInvitePage />} />
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
        <Route path="/sales/recurring/new" element={<NewRecurringInvoicePage />} />
        <Route path="/sales/receipts" element={<SaleReceiptsPage />} />
        <Route path="/sales/receipts/new" element={<NewSaleReceiptPage />} />
        <Route path="/accounting/journals" element={<ManualJournalsPage />} />
        <Route path="/accounting/journals/new" element={<NewManualJournalPage />} />

        {/* Purchases */}
        <Route path="/purchases/bills" element={<BillsPage />} />
        <Route path="/purchases/bills/new" element={<NewBillPage />} />
        <Route path="/purchases/purchase-orders" element={<PurchaseOrdersPage />} />
        <Route path="/purchases/purchase-orders/new" element={<NewPurchaseOrderPage />} />
        <Route path="/purchases/goods-received-notes" element={<GoodsReceivedNotesPage />} />
        <Route path="/purchases/goods-received-notes/new" element={<NewGoodsReceivedNotePage />} />
        <Route path="/purchases/credit-notes" element={<PurchaseCreditNotesPage />} />
        <Route path="/purchases/vendor-credits" element={<VendorCreditsPage />} />
        <Route path="/purchases/vendor-credits/new" element={<NewVendorCreditPage />} />
        <Route path="/purchases/payments" element={<PurchasePaymentsPage />} />
        <Route path="/purchases/payments/new" element={<NewPurchasePaymentPage />} />
        <Route path="/purchases/refunds" element={<PurchaseRefundsPage />} />
        <Route path="/purchases/refunds/new" element={<NewPurchaseRefundPage />} />

        {/* Upload */}
        <Route path="/upload" element={<DocumentsPage />} />

        {/* Bank */}
        <Route path="/bank/accounts" element={<BankAccountsPage />} />
        <Route path="/bank/accounts/new" element={<NewBankAccountPage />} />
        <Route path="/bank/money-in" element={<BankTransactionsPage type="income" />} />
        <Route path="/bank/money-in/new" element={<NewBankTransactionPage />} />
        <Route path="/bank/money-out" element={<BankTransactionsPage type="expense" />} />
        <Route path="/bank/money-out/new" element={<NewBankTransactionPage />} />
        <Route path="/bank/transfers" element={<BankTransfersPage />} />
        <Route path="/bank/transfers/new" element={<NewBankTransferPage />} />
        <Route path="/bank/rules" element={<BankRulesPage />} />

        {/* Contacts */}
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/contacts/new" element={<NewContactPage />} />
        <Route path="/contacts/groups" element={<ContactGroupsPage />} />

        {/* Products */}
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/new" element={<NewProductPage />} />

        {/* Stock */}
        <Route path="/stock/adjustments" element={<StockAdjustmentsPage />} />
        <Route path="/stock/adjustments/new" element={<NewStockAdjustmentPage />} />
        <Route path="/stock/transfers" element={<StockTransfersPage />} />
        <Route path="/stock/transfers/new" element={<NewStockTransferPage />} />
        <Route path="/stock/values" element={<StockValuesPage />} />

        {/* Accounting */}
        <Route path="/accounting" element={<AccountingPage />} />
        <Route path="/accounting/accounts" element={<ChartOfAccountsPage />} />
        <Route path="/accounting/fixed-assets" element={<FixedAssetsPage />} />
        <Route path="/accounting/fixed-assets/new" element={<NewFixedAssetPage />} />

        {/* Reports */}
        <Route path="/reports" element={<ReportsIndexPage />} />
        <Route path="/reports/aged-receivables" element={<AgedReceivablesPage />} />
        <Route path="/reports/aged-payables" element={<AgedPayablesPage />} />
        <Route path="/reports/trial-balance" element={<TrialBalancePage />} />
        <Route path="/reports/general-ledger" element={<GeneralLedgerPage />} />
        <Route path="/reports/sst-02" element={<SST02Page />} />
        <Route path="/reports/profit-loss" element={<ProfitLossPage />} />
        <Route path="/reports/balance-sheet" element={<BalanceSheetPage />} />
        <Route path="/reports/cash-flow" element={<CashFlowPage />} />
        <Route path="/reports/invoice-summary" element={<InvoiceSummaryPage />} />
        <Route path="/reports/bill-summary" element={<BillSummaryPage />} />
        <Route path="/reports/payment-summary" element={<PaymentSummaryPage />} />
        <Route path="/reports/transaction-list" element={<TransactionListPage />} />
        <Route path="/reports/debtor-ledger" element={<DebtorLedgerPage />} />
        <Route path="/reports/creditor-ledger" element={<CreditorLedgerPage />} />
        <Route path="/reports/sst-sales-detail" element={<SSTSalesDetailPage />} />
        <Route path="/reports/sst-purchase-detail" element={<SSTPurchaseDetailPage />} />
        <Route path="/reports/stock-values" element={<StockValuesReportPage />} />
        <Route path="/reports/inventory-summary" element={<InventorySummaryPage />} />
        <Route path="/reports/bank-reconciliation" element={<BankReconciliationPage />} />

        {/* MyInvois (MY) / SG Compliance */}
        <Route path="/myinvois" element={<MyInvoisPage />} />
        <Route path="/sg-compliance" element={<SgCompliancePage />} />

        <Route path="/ai-assistant" element={<AIAssistantPage />} />
        <Route path="/billing" element={<BillingPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/settings/company" element={<CompanySettingsPage />} />
        <Route path="/settings/invoice-templates" element={<InvoiceTemplatesPage />} />
        <Route path="/settings/custom-fields" element={<CustomFieldsPage />} />

        {/* Firm / Practice */}
        <Route path="/firm/settings" element={<FirmSettingsPage />} />
        <Route path="/firm/dashboard" element={<PracticeDashboardPage />} />

        {/* Shared Documents */}
        <Route path="/shared-documents" element={<SharedDocumentsOwnerPage />} />
        <Route path="/shared-with-me" element={<SharedDocumentsPage />} />
        <Route path="/my-accountants" element={<MyAccountantsPage />} />
        <Route path="/firm/clients" element={<FirmClientsPage />} />

        {/* Catch-all: redirect unknown routes to dashboard */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}

export default App
