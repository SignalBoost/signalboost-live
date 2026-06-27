// saas/lib/cos-marketing-sales/prismaSchema.ts
// Portable Prisma/PostgreSQL contract for COS Marketing + Sales.
// Keep this module decoupled from Supabase-specific implementation details so the
// COS module can be white-labeled or licensed independently later.

export const COS_PRISMA_SCHEMA_VERSION = 'cos-marketing-sales.prisma.v1' as const

export type CosPrismaModelName =
  | 'LeadCapture'
  | 'OutreachEvent'
  | 'OutreachMilestone'
  | 'OrganicContentAsset'
  | 'PodcastSequence'
  | 'PrintDeskSubmission'
  | 'CosTelemetryEvent'

export type CosPrismaModelContract = {
  name: CosPrismaModelName
  purposeKey: string
  indexes: string[]
  prisma: string
}

export const COS_PRISMA_MODELS: CosPrismaModelContract[] = [
  {
    name: 'LeadCapture',
    purposeKey: 'cos.schema.leadCapture.purpose',
    indexes: ['workspaceId', 'domain', 'source', 'status', 'createdAt'],
    prisma: `model LeadCapture {
  id                 String   @id @default(uuid())
  workspaceId        String?
  email              String
  name               String?
  company            String?
  domain             String
  source             String
  status             String   @default("new")
  locale             String   @default("en")
  country            String?
  intentTags         Json     @default("[]")
  score              Int      @default(0)
  notes              String?
  followUpMilestones Json     @default("[]")
  metadataJson       Json     @default("{}")
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  outreachEvents     OutreachEvent[]
  milestones         OutreachMilestone[]

  @@index([workspaceId, createdAt])
  @@index([domain, createdAt])
  @@index([source, status])
}`,
  },
  {
    name: 'OutreachMilestone',
    purposeKey: 'cos.schema.outreachMilestone.purpose',
    indexes: ['leadId', 'status', 'milestoneKey', 'scheduledFor'],
    prisma: `model OutreachMilestone {
  id             String   @id @default(uuid())
  leadId         String
  milestoneKey   String
  locale         String   @default("en")
  channel        String
  status         String   @default("planned")
  scheduledFor   DateTime?
  approvedAt     DateTime?
  rejectedAt     DateTime?
  payloadJson    Json     @default("{}")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  lead           LeadCapture @relation(fields: [leadId], references: [id], onDelete: Cascade)

  @@index([leadId, status])
  @@index([milestoneKey, scheduledFor])
}`,
  },
  {
    name: 'OutreachEvent',
    purposeKey: 'cos.schema.outreachEvent.purpose',
    indexes: ['recipientDomain+createdAt', 'leadId', 'status'],
    prisma: `model OutreachEvent {
  id              String   @id @default(uuid())
  leadId          String?
  recipientEmail  String
  recipientDomain String
  channel         String
  status          String   @default("planned")
  milestoneKey    String?
  subjectKey      String?
  bodyKey         String?
  payloadJson     Json     @default("{}")
  createdAt       DateTime @default(now())

  lead            LeadCapture? @relation(fields: [leadId], references: [id], onDelete: SetNull)

  @@index([recipientDomain, createdAt])
  @@index([leadId, status])
}`,
  },
  {
    name: 'OrganicContentAsset',
    purposeKey: 'cos.schema.organicContentAsset.purpose',
    indexes: ['workspaceId', 'campaignId', 'approvalStatus'],
    prisma: `model OrganicContentAsset {
  id             String   @id @default(uuid())
  workspaceId    String?
  campaignId     String?
  locale         String
  assetType      String
  titleKey       String
  bodyKey        String
  bodyVariables  Json     @default("{}")
  status         String   @default("draft")
  approvalStatus String   @default("pending")
  payloadJson    Json     @default("{}")
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([workspaceId, createdAt])
  @@index([campaignId, approvalStatus])
}`,
  },
  {
    name: 'PodcastSequence',
    purposeKey: 'cos.schema.podcastSequence.purpose',
    indexes: ['workspaceId', 'locale', 'status'],
    prisma: `model PodcastSequence {
  id           String   @id @default(uuid())
  workspaceId  String?
  locale       String
  titleKey     String
  provider     String   @default("mock")
  durationSec  Int
  payloadJson  Json
  status       String   @default("draft")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([workspaceId, createdAt])
  @@index([locale, status])
}`,
  },
  {
    name: 'PrintDeskSubmission',
    purposeKey: 'cos.schema.printDeskSubmission.purpose',
    indexes: ['workspaceId', 'campaignId', 'status'],
    prisma: `model PrintDeskSubmission {
  id              String   @id @default(uuid())
  workspaceId     String?
  campaignId      String?
  publisherName   String
  deskEmail       String
  locale          String
  assetId         String
  assetTitleKey   String
  fileName        String
  fileUrl         String?
  dimensionsJson  Json
  payloadJson     Json
  status          String   @default("compiled_not_sent")
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([workspaceId, createdAt])
  @@index([campaignId, status])
}`,
  },
  {
    name: 'CosTelemetryEvent',
    purposeKey: 'cos.schema.telemetryEvent.purpose',
    indexes: ['workspaceId+occurredAt', 'eventName+occurredAt', 'anonymousId+occurredAt'],
    prisma: `model CosTelemetryEvent {
  id            String   @id @default(uuid())
  schemaVersion String
  workspaceId   String?
  userId        String?
  anonymousId   String?
  sessionId     String?
  eventName     String
  eventSource   String
  locale        String?
  occurredAt    DateTime
  payloadJson   Json
  azureJson     Json     @default("{}")
  createdAt     DateTime @default(now())

  @@index([workspaceId, occurredAt])
  @@index([eventName, occurredAt])
  @@index([anonymousId, occurredAt])
}`,
  },
]

export function getCosPrismaModel(name: CosPrismaModelName) {
  return COS_PRISMA_MODELS.find(model => model.name === name)
}

export function buildCosPrismaSchemaFragment() {
  return COS_PRISMA_MODELS.map(model => model.prisma).join('\n\n')
}
