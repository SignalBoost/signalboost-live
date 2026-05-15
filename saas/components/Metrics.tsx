// saas/components/Metrics.tsx
export default function Metrics() {
  const stats = [
    { label: 'Ads Generated', value: '2M+' },
    { label: 'Languages Supported', value: '15+' },
    { label: 'Plays This Week', value: '1,200+' },
  ]

  return (
    <section className="py-12 bg-white text-center">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {stats.map((stat, idx) => (
          <div key={idx} className="p-6 border rounded shadow-sm">
            <p className="text-3xl font-bold text-blue-600">{stat.value}</p>
            <p className="text-gray-600 mt-2">{stat.label}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
