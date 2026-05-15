// saas/components/FeaturesFlow.tsx
export default function FeaturesFlow() {
  const steps = [
    { title: 'Review', icon: '💬', description: 'Start with a customer review.' },
    { title: 'Video Ad', icon: '🎥', description: 'Turn it into a visual ad.' },
    { title: 'Voice Ad', icon: '🎙️', description: 'Add native-language voice narration.' },
    { title: 'Publish', icon: '🚀', description: 'Push your ad live instantly.' },
  ]

  return (
    <section className="py-16 bg-gray-50 text-center">
      <h2 className="text-2xl font-bold mb-10">How It Works</h2>
      <div className="flex flex-col md:flex-row justify-center items-center gap-8">
        {steps.map((step, idx) => (
          <div key={idx} className="flex flex-col items-center max-w-[180px]">
            <div className="text-4xl mb-4">{step.icon}</div>
            <h3 className="font-semibold">{step.title}</h3>
            <p className="text-sm text-gray-600 mt-2">{step.description}</p>
            {idx < steps.length - 1 && (
              <div className="hidden md:block text-2xl mx-4">➡️</div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
