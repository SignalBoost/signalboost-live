'use client'

import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

export type CosaCampaignFeedItem = {
  id: string
  title: string
  status: string
  description: string
  cta: string
  source?: string
}

type CosaCampaignFeedProps = {
  campaigns: CosaCampaignFeedItem[]
  selectedId?: string | null
  onSelect?: (campaign: CosaCampaignFeedItem) => void
  fetchNextPage?: () => void | Promise<void>
  hasMore?: boolean
  isFetchingNextPage?: boolean
  emptyLabel?: string
}

function statusClassName(status: string) {
  const normalized = status.toLowerCase()
  if (normalized === 'approved') return 'border-emerald-500/30 bg-emerald-500/20 text-emerald-300'
  if (normalized === 'sent') return 'border-blue-500/30 bg-blue-500/20 text-blue-300'
  if (normalized === 'rejected') return 'border-rose-500/30 bg-rose-500/20 text-rose-300'
  return 'border-amber-500/30 bg-amber-500/20 text-amber-300'
}

export default function CosaCampaignFeed({
  campaigns,
  selectedId,
  onSelect,
  fetchNextPage,
  hasMore = false,
  isFetchingNextPage = false,
  emptyLabel = 'No campaigns yet.',
}: CosaCampaignFeedProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: campaigns.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 176,
    overscan: 4,
    getItemKey: index => campaigns[index]?.id ?? index,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()

  useEffect(() => {
    if (!fetchNextPage || !hasMore || isFetchingNextPage) return
    const lastItem = virtualItems[virtualItems.length - 1]
    if (!lastItem) return
    if (lastItem.index >= campaigns.length - 3) fetchNextPage()
  }, [virtualItems, campaigns.length, fetchNextPage, hasMore, isFetchingNextPage])

  if (!campaigns.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-white/45">
        {emptyLabel}
      </div>
    )
  }

  return (
    <div
      ref={parentRef}
      className="h-[520px] w-full overflow-y-auto pr-2"
      aria-label="COSA campaign feed"
    >
      <div className="relative w-full" style={{ height: `${rowVirtualizer.getTotalSize()}px` }}>
        {virtualItems.map(virtualItem => {
          const campaign = campaigns[virtualItem.index]
          if (!campaign) return null
          const selected = campaign.id === selectedId

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={rowVirtualizer.measureElement}
              className="absolute left-0 top-0 w-full p-1.5"
              style={{ transform: `translateY(${virtualItem.start}px)` }}
            >
              <button
                type="button"
                onClick={() => onSelect?.(campaign)}
                className={[
                  'w-full rounded-2xl border p-4 text-left outline-none transition duration-150',
                  'bg-slate-900/40 shadow-xl backdrop-blur-md focus-visible:ring-2 focus-visible:ring-cyan-300',
                  selected
                    ? 'border-amber-300/60 bg-amber-300/10 shadow-amber-500/10'
                    : 'border-white/10 hover:border-cyan-300/35 hover:bg-white/[.045]',
                ].join(' ')}
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <h3 className="min-w-0 max-w-[78%] truncate text-sm font-bold text-white">
                    {campaign.title}
                  </h3>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide ${statusClassName(campaign.status)}`}>
                    {campaign.status}
                  </span>
                </div>

                <p className="line-clamp-2 text-xs leading-5 text-white/55">
                  {campaign.description || 'No campaign summary available yet.'}
                </p>

                <div className="mt-3 rounded-xl border border-white/5 bg-black/25 p-3 font-mono text-[11px] text-amber-300/90">
                  <span className="mb-1 block font-sans text-[10px] font-bold uppercase tracking-wider text-white/35">
                    CTA Target
                  </span>
                  <span className="line-clamp-1 break-all">{campaign.cta || campaign.source || 'No URL'}</span>
                </div>
              </button>
            </div>
          )
        })}

        {isFetchingNextPage && (
          <div className="absolute bottom-0 left-0 w-full p-4 text-center text-sm text-white/45">
            Loading more campaigns...
          </div>
        )}
      </div>
    </div>
  )
}
