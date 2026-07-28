import { uiText } from '@/lib/i18n/uiText'
const metrics = [
  { value: '1,200+', label: uiText('generatedUi.u_ea730b4a1ad0280b') },
  { value: '4.9★', label: uiText('generatedUi.u_df99f9ff9fd5b3b9') },
  { value: '3x', label: uiText('generatedUi.u_522f9a85e004484b') },
]

export default function Metrics() {
  return (
    <section className="bg-[#0f0f0f] px-6 py-16">
      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        {metrics.map((m) => (
          <div key={m.label} className="bg-white/5 border border-white/10 rounded-2xl p-8 text-center">
            <div className="text-4xl font-black text-yellow-400 mb-2">{m.value}</div>
            <div className="text-white/50 text-sm">{m.label}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
