// saas/lib/cos-marketing-sales/schema.ts
// TypeScript database schema outline for the portable COS Marketing + Sales Engine.
// Intended storage: PostgreSQL through Prisma, Supabase, or another tenant-aware adapter.

export type SchemaField = {
  name: string
  type: string
  required: boolean
  defaultValue?: string
  index?: boolean
  notes?: string
}

export type SchemaModel = {
  name: string
  purpose: string
  fields: SchemaField[]
  indexes: string[]
}

export const COS_MARKETING_SALES_SCHEMA: SchemaModel[] = [
  {
    name: 'LeadCapture',
    purpose: 'Tracks inbound or manually imported leads, tags, language, status, and follow-up milestones.',
    indexes: ['workspaceId', 'domain', 'status', 'source'],
    fields: [
      { name: 'id', type: 'uuid/string', required: true, defaultValue: 'generated id' },
      { name: 'workspaceId', type: 'uuid/string', required: false, index: true },
      { name: 'email', type: 'string', required: true },
      { name: 'name', type: 'string', required: false },
      { name: 'company', type: 'string', required: false },
      { name: 'domain', type: 'string', required: true, index: true },
      { name: 'source', type: 'LeadSource', required: true, index: true },
      { name: 'status', type: 'LeadStatus', required: true, defaultValue: 'new', index: true },
      { name: 'locale', type: 'CosLocale', required: true, defaultValue: 'en' },
      { name: 'country', type: 'string', required: false },
      { name: 'tags', type: 'string[]', required: true, defaultValue: '[]' },
      { name: 'score', type: 'number', required: true, defaultValue: '0' },
      { name: 'notes', type: 'string', required: false },
      { name: 'followUpMilestones', type: 'FollowUpMilestone[]', required: true, defaultValue: '[]' },
      { name: 'createdAt', type: 'datetime', required: true, defaultValue: 'now' },
      { name: 'updatedAt', type: 'datetime', required: true, defaultValue: 'now' },
    ],
  },
  {
    name: 'OutreachEvent',
    purpose: 'Records planned, blocked, approved, or sent outreach events for deliverability and audit logs.',
    indexes: ['recipientDomain+createdAt', 'leadId', 'status'],
    fields: [
      { name: 'id', type: 'uuid/string', required: true, defaultValue: 'generated id' },
      { name: 'leadId', type: 'uuid/string', required: false, index: true },
      { name: 'recipientEmail', type: 'string', required: true },
      { name: 'recipientDomain', type: 'string', required: true, index: true },
      { name: 'channel', type: 'OutreachChannel', required: true },
      { name: 'status', type: 'planned | sent | blocked | failed', required: true, index: true },
      { name: 'milestone', type: 'FollowUpMilestone', required: false },
      { name: 'subject', type: 'string', required: false },
      { name: 'createdAt', type: 'datetime', required: true, defaultValue: 'now' },
    ],
  },
  {
    name: 'OrganicContentAsset',
    purpose: 'Stores approved or pending social, podcast, audio, print, and zero-dollar marketing content assets.',
    indexes: ['workspaceId', 'campaignId', 'approvalStatus'],
    fields: [
      { name: 'id', type: 'uuid/string', required: true, defaultValue: 'generated id' },
      { name: 'workspaceId', type: 'uuid/string', required: false, index: true },
      { name: 'campaignId', type: 'uuid/string', required: false, index: true },
      { name: 'locale', type: 'CosLocale', required: true },
      { name: 'assetType', type: 'social | email | podcast | print | video_script | brief', required: true },
      { name: 'title', type: 'string', required: true },
      { name: 'body', type: 'string', required: true },
      { name: 'status', type: 'draft | ready | archived', required: true, defaultValue: 'draft' },
      { name: 'approvalStatus', type: 'pending | approved | rejected', required: true, defaultValue: 'pending', index: true },
      { name: 'createdAt', type: 'datetime', required: true, defaultValue: 'now' },
      { name: 'updatedAt', type: 'datetime', required: true, defaultValue: 'now' },
    ],
  },
  {
    name: 'PodcastSequence',
    purpose: 'Stores structured two-host audio episode plans before external audio rendering.',
    indexes: ['workspaceId', 'locale'],
    fields: [
      { name: 'id', type: 'uuid/string', required: true, defaultValue: 'generated id' },
      { name: 'workspaceId', type: 'uuid/string', required: false, index: true },
      { name: 'locale', type: 'CosLocale', required: true, index: true },
      { name: 'title', type: 'string', required: true },
      { name: 'provider', type: 'mock | autocontent | elevenlabs', required: true, defaultValue: 'mock' },
      { name: 'durationSec', type: 'number', required: true },
      { name: 'payloadJson', type: 'json', required: true },
      { name: 'status', type: 'draft | approved | rendered', required: true, defaultValue: 'draft' },
      { name: 'createdAt', type: 'datetime', required: true, defaultValue: 'now' },
      { name: 'updatedAt', type: 'datetime', required: true, defaultValue: 'now' },
    ],
  },
  {
    name: 'PrintDeskSubmission',
    purpose: 'Compiles approved print-ready assets into a publisher ad-desk payload and email fallback plan.',
    indexes: ['workspaceId', 'campaignId', 'status'],
    fields: [
      { name: 'id', type: 'uuid/string', required: true, defaultValue: 'generated id' },
      { name: 'workspaceId', type: 'uuid/string', required: false, index: true },
      { name: 'campaignId', type: 'uuid/string', required: false, index: true },
      { name: 'publisherName', type: 'string', required: true },
      { name: 'deskEmail', type: 'string', required: true },
      { name: 'locale', type: 'CosLocale', required: true },
      { name: 'assetId', type: 'string', required: true },
      { name: 'assetTitle', type: 'string', required: true },
      { name: 'fileName', type: 'string', required: true },
      { name: 'fileUrl', type: 'string', required: false },
      { name: 'dimensionsJson', type: 'json', required: true },
      { name: 'payloadJson', type: 'json', required: true },
      { name: 'status', type: 'compiled_not_sent | ready_for_owner_approval | approved_ready_to_email | sent', required: true, defaultValue: 'compiled_not_sent', index: true },
      { name: 'createdAt', type: 'datetime', required: true, defaultValue: 'now' },
      { name: 'updatedAt', type: 'datetime', required: true, defaultValue: 'now' },
    ],
  },
]
