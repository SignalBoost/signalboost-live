// Public discovery catalogue. An entry here does NOT grant credentials or execution.
// Only LAB_PROVIDER_CATALOG and its server-side allowlist can authorize real connections.
export type LabDiscoverableProvider = Readonly<{
  id: string
  name: string
  category: 'AI models' | 'GPU & compute' | 'AI development' | 'Universal'
  status: 'planned'
  description: string
}>
const planned = (id: string, name: string, category: LabDiscoverableProvider['category'], description: string): LabDiscoverableProvider =>
  Object.freeze({ id, name, category, status: 'planned', description })

export const LAB_PROVIDER_DISCOVERY: readonly LabDiscoverableProvider[] = Object.freeze([
  planned('xai', 'Grok / xAI', 'AI models', 'Dedicated provider connection coming soon'),
  planned('deepseek', 'DeepSeek', 'AI models', 'Dedicated provider connection coming soon'),
  planned('qwen', 'Qwen / Alibaba Cloud', 'AI models', 'DashScope adapter coming soon'),
  planned('mistral', 'Mistral AI', 'AI models', 'Provider adapter coming soon'),
  planned('cohere', 'Cohere', 'AI models', 'Provider adapter coming soon'),
  planned('perplexity', 'Perplexity', 'AI models', 'Provider adapter coming soon'),
  planned('openrouter', 'OpenRouter', 'AI models', 'Router adapter coming soon'),
  planned('groq', 'GroqCloud', 'AI models', 'Inference adapter coming soon'),
  planned('ollama', 'Ollama', 'AI models', 'Secure local gateway required'),
  planned('copilot', 'Microsoft Copilot', 'AI development', 'Microsoft-supported integration required'),
  planned('lovable', 'Lovable', 'AI development', 'Application-building connector coming soon'),
  planned('replit', 'Replit', 'AI development', 'Application-building connector coming soon'),
  planned('bolt', 'Bolt', 'AI development', 'Application-building connector coming soon'),
  planned('cursor', 'Cursor', 'AI development', 'Development tool connector coming soon'),
  planned('runpod', 'RunPod', 'GPU & compute', 'Training GPU adapter coming soon'),
  planned('deepinfra', 'DeepInfra', 'GPU & compute', 'Hosted inference and compute adapter coming soon'),
  planned('vast', 'Vast.ai', 'GPU & compute', 'GPU rental adapter coming soon'),
  planned('lambda', 'Lambda Cloud', 'GPU & compute', 'GPU compute adapter coming soon'),
  planned('modal', 'Modal', 'GPU & compute', 'Serverless compute adapter coming soon'),
  planned('coreweave', 'CoreWeave', 'GPU & compute', 'Compute adapter coming soon'),
  planned('nebius', 'Nebius', 'GPU & compute', 'Compute adapter coming soon'),
  planned('fluidstack', 'Fluidstack', 'GPU & compute', 'Compute adapter coming soon'),
  planned('crusoe', 'Crusoe', 'GPU & compute', 'Compute adapter coming soon'),
  planned('hyperstack', 'Hyperstack', 'GPU & compute', 'Compute adapter coming soon'),
  planned('tensordock', 'TensorDock', 'GPU & compute', 'Compute adapter coming soon'),
  planned('spheron', 'Spheron', 'GPU & compute', 'Compute adapter coming soon'),
  planned('gmi', 'GMI Cloud', 'GPU & compute', 'Compute adapter coming soon'),
  planned('salad', 'SaladCloud', 'GPU & compute', 'Compute adapter coming soon'),
  planned('paperspace', 'Paperspace', 'GPU & compute', 'Compute adapter coming soon'),
  planned('together', 'Together AI', 'GPU & compute', 'Inference and fine-tuning adapter coming soon'),
  planned('fireworks', 'Fireworks AI', 'GPU & compute', 'Inference adapter coming soon'),
  planned('replicate', 'Replicate', 'GPU & compute', 'Execution adapter coming soon'),
  planned('baseten', 'Baseten', 'GPU & compute', 'Deployment adapter coming soon'),
  planned('bedrock', 'AWS Bedrock', 'GPU & compute', 'AWS authorization required'),
  planned('azure', 'Azure AI', 'GPU & compute', 'Azure resource authorization required'),
  planned('vertex', 'Google Vertex AI', 'GPU & compute', 'Google Cloud authorization required'),
  planned('universal', 'Universal / custom provider', 'Universal', 'Compatible custom APIs only; requires safe endpoint configuration'),
])
