// saas/lib/hub/provider-templates-bank.ts
// Hub Console — Bank provider action templates.
//
// These are the CLIENT-side form definitions for the Bank provider card. They are
// merged into PROVIDER_TEMPLATES by provider-templates.ts (Object.assign), so the
// console cards, the form renderer, and validateTemplatePayload pick them up. The
// matching server-side executors + schemas live in console-core/executors/bank.ts,
// and bank.* templateIds are routed to /api/hub/action/engine (see
// ProviderActionForm.tsx ENGINE_PROVIDERS). Field ids here mirror the executor
// schema exactly so client and server agree.
//
// Localization: labels/descriptions resolve through localizeTemplate() →
// console.tpl.bank.<action>.{label,desc}; field/section labels via console.fld.* /
// console.sec.*. Native strings for en/es/pt/pl/ru live in lib/i18n/bankCopy.ts
// (consulted by lib/i18n/t.ts), so nothing renders English-only for a buyer.

import type { ProviderTemplate } from './provider-templates'
import { bankInstitutionOptions } from './bank-registry'

const INSTITUTION = {
  id: 'institution', label: 'Institution', type: 'select' as const, required: true,
  options: bankInstitutionOptions(),
}
const ACCOUNT = {
  id: 'accountId', label: 'Account', type: 'remote_select' as const, required: true,
  source: { action: 'bank.list_accounts', dataPath: 'accounts', valueKey: 'id', labelTemplate: '{label}', dependsOn: ['institution'], emptyHint: 'Connect the institution first' },
}

export const BANK_TEMPLATES: Record<string, ProviderTemplate> = {
  'bank.start_enrollment': {
    id: 'bank.start_enrollment',
    label: 'Connect (Send Email OTP)',
    description: 'Begin Email-OTP enrollment. A one-time passcode is sent to your bank-registered email; the console never sees your banking password.',
    icon: '✉️',
    policyActionId: 'bank_connect',
    api: { service: 'bank', method: 'POST', endpoint: '/auth/otp/start' },
    fields: [
      INSTITUTION,
      { id: 'email', label: 'Bank-registered email', type: 'email', required: true, placeholder: 'name@domain.com' },
    ],
  },
  'bank.complete_enrollment': {
    id: 'bank.complete_enrollment',
    label: 'Verify & Connect',
    description: 'Enter the one-time passcode to exchange it for an OAuth2 token. The token is stored AES-256-GCM encrypted in the Key Vault and auto-refreshes.',
    icon: '🔐',
    requiresConfirm: true,
    policyActionId: 'bank_connect',
    api: { service: 'bank', method: 'POST', endpoint: '/auth/otp/verify' },
    fields: [
      INSTITUTION,
      { id: 'email', label: 'Bank-registered email', type: 'email', required: true },
      { id: 'otp', label: 'One-time passcode', type: 'text', required: true, placeholder: '123456', maxLength: 12 },
    ],
  },
  'bank.list_accounts': {
    id: 'bank.list_accounts',
    label: 'List Accounts',
    description: 'List the connected accounts for an institution (source for the account pickers).',
    icon: '🏦',
    policyActionId: 'bank_read',
    api: { service: 'bank', method: 'GET', endpoint: '/accounts' },
    fields: [INSTITUTION],
  },
  'bank.check_balance': {
    id: 'bank.check_balance',
    label: 'Check Balance',
    description: 'Retrieve the available and current balance for a connected account.',
    icon: '💰',
    policyActionId: 'bank_read',
    api: { service: 'bank', method: 'GET', endpoint: '/accounts/{id}/balance' },
    fields: [INSTITUTION, ACCOUNT],
  },
  'bank.transaction_history': {
    id: 'bank.transaction_history',
    label: 'Transaction History',
    description: 'List recent transactions for a connected account, optionally within a date range.',
    icon: '📜',
    policyActionId: 'bank_read',
    api: { service: 'bank', method: 'GET', endpoint: '/accounts/{id}/transactions' },
    fields: [
      INSTITUTION, ACCOUNT,
      { id: 'from', label: 'From date', type: 'text', required: false, placeholder: 'YYYY-MM-DD' },
      { id: 'to', label: 'To date', type: 'text', required: false, placeholder: 'YYYY-MM-DD' },
    ],
  },
  'bank.download_statement': {
    id: 'bank.download_statement',
    label: 'Download Statement',
    description: 'Get a signed, short-lived download link for an account statement.',
    icon: '📄',
    policyActionId: 'bank_read',
    api: { service: 'bank', method: 'GET', endpoint: '/accounts/{id}/statements' },
    fields: [
      INSTITUTION, ACCOUNT,
      { id: 'period', label: 'Statement period', type: 'select', required: true, options: [
        { label: 'Most recent', value: 'latest' },
        { label: 'Last month', value: 'last_month' },
        { label: 'Last 3 months', value: 'last_3_months' },
        { label: 'Year to date', value: 'ytd' },
      ] },
    ],
  },
  'bank.send_payment': {
    id: 'bank.send_payment',
    label: 'Send Payment',
    description: 'Initiate a payment from a connected account. Owner approval, preview, and audit logging are enforced; an idempotency key prevents double-payment.',
    icon: '💸',
    requiresConfirm: true,
    previewBeforeSubmit: true,
    policyActionId: 'bank_send_payment',
    api: { service: 'bank', method: 'POST', endpoint: '/payments/initiate' },
    fields: [
      INSTITUTION,
      { id: 'fromAccountId', label: 'From account', type: 'remote_select', required: true,
        source: { action: 'bank.list_accounts', dataPath: 'accounts', valueKey: 'id', labelTemplate: '{label}', dependsOn: ['institution'], emptyHint: 'Connect the institution first' } },
      { id: 'toAccount', label: 'To account / counterparty', type: 'text', required: true },
      { id: 'amount', label: 'Amount', type: 'number', required: true, min: 0.01, step: 0.01, placeholder: '100.00' },
      { id: 'currency', label: 'Currency', type: 'select', required: true, options: [{ label: 'USD', value: 'USD' }] },
      { id: 'memo', label: 'Memo', type: 'text', required: false, maxLength: 140 },
    ],
  },
  'bank.refresh_token': {
    id: 'bank.refresh_token',
    label: 'Refresh Token',
    description: 'Force an OAuth2 token refresh for an institution (refresh also runs automatically before every call).',
    icon: '🔄',
    policyActionId: 'bank_refresh',
    api: { service: 'bank', method: 'POST', endpoint: '/auth/token/refresh' },
    fields: [INSTITUTION],
  },
  'bank.compliance_log': {
    id: 'bank.compliance_log',
    label: 'Compliance Log',
    description: 'Inspect the banking compliance and audit trail (every connect, read, refresh, and payment).',
    icon: '🧾',
    policyActionId: 'bank_read',
    api: { service: 'bank', method: 'GET', endpoint: '/compliance/log' },
    fields: [
      { id: 'institution', label: 'Institution', type: 'select', required: false, options: bankInstitutionOptions() },
    ],
  },
}
