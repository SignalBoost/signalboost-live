import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

type ProviderDefinition = {
  id: string
  name: string
  icon: string
  defaultMethod: string
  methods: string[]
  authType: 'bearer' | 'api_key' | 'oauth' | 'none'
  authSchema: Array<{ key: string; label: string; type: 'secret_ref' | 'oauth_ref' }>
  variables: string[]
  endpoints: Array<{ id: string; url: string; example: string }>
}

const providers: ProviderDefinition[] = [
  {
    id: 'hubspot',
    name: 'HubSpot',
    icon: '◉',
    defaultMethod: 'POST',
    methods: ['GET', 'POST', 'PATCH'],
    authType: 'oauth',
    authSchema: [{ key: 'connectionRef', label: 'OAuth connection', type: 'oauth_ref' }],
    variables: ['contact.email', 'contact.firstname', 'contact.lastname', 'company.name'],
    endpoints: [
      { id: 'contacts', url: 'https://api.hubapi.com/crm/v3/objects/contacts', example: 'Create or search contacts' },
      { id: 'companies', url: 'https://api.hubapi.com/crm/v3/objects/companies', example: 'Create or search companies' },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    icon: '◆',
    defaultMethod: 'POST',
    methods: ['POST', 'GET'],
    authType: 'bearer',
    authSchema: [{ key: 'botTokenRef', label: 'Bot token reference', type: 'secret_ref' }],
    variables: ['message.channel', 'message.text', 'message.threadTs'],
    endpoints: [
      { id: 'chat-post-message', url: 'https://slack.com/api/chat.postMessage', example: 'Post a channel or direct message' },
      { id: 'conversations-list', url: 'https://slack.com/api/conversations.list', example: 'List available conversations' },
    ],
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    icon: '☁',
    defaultMethod: 'POST',
    methods: ['GET', 'POST', 'PATCH'],
    authType: 'oauth',
    authSchema: [{ key: 'connectionRef', label: 'OAuth connection', type: 'oauth_ref' }],
    variables: ['lead.email', 'lead.company', 'lead.firstName', 'lead.lastName'],
    endpoints: [
      { id: 'sobjects-lead', url: 'https://{{instanceHost}}/services/data/v61.0/sobjects/Lead', example: 'Create or update leads' },
      { id: 'query', url: 'https://{{instanceHost}}/services/data/v61.0/query', example: 'Run a SOQL query' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    icon: '◌',
    defaultMethod: 'POST',
    methods: ['POST', 'GET'],
    authType: 'bearer',
    authSchema: [{ key: 'apiKeyRef', label: 'API key reference', type: 'secret_ref' }],
    variables: ['input.prompt', 'input.language', 'input.customerId'],
    endpoints: [
      { id: 'responses', url: 'https://api.openai.com/v1/responses', example: 'Create a model response' },
      { id: 'files', url: 'https://api.openai.com/v1/files', example: 'Upload or list files' },
    ],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    icon: '◇',
    defaultMethod: 'POST',
    methods: ['GET', 'POST', 'DELETE'],
    authType: 'bearer',
    authSchema: [{ key: 'secretKeyRef', label: 'Secret key reference', type: 'secret_ref' }],
    variables: ['customer.email', 'customer.id', 'invoice.id'],
    endpoints: [
      { id: 'customers', url: 'https://api.stripe.com/v1/customers', example: 'Create or retrieve customers' },
      { id: 'checkout', url: 'https://api.stripe.com/v1/checkout/sessions', example: 'Create checkout sessions' },
    ],
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: '⬢',
    defaultMethod: 'GET',
    methods: ['GET', 'POST', 'PATCH', 'PUT'],
    authType: 'oauth',
    authSchema: [{ key: 'connectionRef', label: 'GitHub connection', type: 'oauth_ref' }],
    variables: ['repo.owner', 'repo.name', 'pull.number'],
    endpoints: [
      { id: 'issues', url: 'https://api.github.com/repos/{{repo.owner}}/{{repo.name}}/issues', example: 'Create or query issues' },
      { id: 'pulls', url: 'https://api.github.com/repos/{{repo.owner}}/{{repo.name}}/pulls', example: 'Open or query pull requests' },
    ],
  },
]

export async function GET() {
  return NextResponse.json({ providers })
}
