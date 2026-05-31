import { partners } from '@/lib/marketplace/partners'

export default function PartnerMarquee() {
  return <div className="mt-8 flex gap-4 overflow-hidden rounded-3xl border border-white/10 bg-white/[.03] p-4">{partners.slice(0, 8).map((partner) => <div key={partner.id} className="flex min-w-44 items-center gap-3 rounded-2xl bg-black/40 p-3"><img src={partner.logo} alt={`${partner.name} logo`} className="h-8 w-8 rounded bg-white object-contain" /><span className="text-sm font-bold">{partner.name}</span></div>)}</div>
}
