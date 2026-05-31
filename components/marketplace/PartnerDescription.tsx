import { type Partner, type Region, getRegionalUrl } from '@/lib/marketplace/partners'

export default function PartnerDescription({ partner, region, cta }: { partner: Partner; region: Region; cta: string }) {
  return <article className="rounded-3xl border border-white/10 bg-white/[.04] p-5"><div className="flex items-center gap-4"><img src={partner.logo} alt={`${partner.name} logo`} className="h-12 w-12 rounded-xl bg-white object-contain p-1" /><div><h2 className="text-xl font-bold">{partner.name}</h2><p className="text-xs uppercase tracking-[0.2em] text-[#FFD700]">{partner.category}</p></div></div><p className="mt-4 text-sm text-white/70">{partner.description}</p><a href={getRegionalUrl(partner, region)} className="mt-5 inline-block rounded-full bg-[#FFD700] px-4 py-2 text-sm font-bold text-black no-underline" rel="nofollow sponsored noopener noreferrer" target="_blank">{cta}</a></article>
}
