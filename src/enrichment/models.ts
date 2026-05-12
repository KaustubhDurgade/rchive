export interface OllamaModelDef {
  id: string
  size: string
  minRam: string
  note: string
}

export const OLLAMA_MODELS: OllamaModelDef[] = [
  // Small — run on any machine with 4 GB RAM
  { id: 'qwen2.5:3b',   size: '2.0 GB', minRam: '4 GB',  note: 'best JSON · recommended' },
  { id: 'llama3.2:3b',  size: '2.0 GB', minRam: '4 GB',  note: 'popular · general use' },
  { id: 'phi4-mini',    size: '2.5 GB', minRam: '4 GB',  note: 'fast · good reasoning' },
  // Medium — 8 GB RAM
  { id: 'qwen2.5:7b',   size: '4.7 GB', minRam: '8 GB',  note: 'better quality' },
  { id: 'llama3.1:8b',  size: '4.7 GB', minRam: '8 GB',  note: 'great all-around' },
  { id: 'mistral:7b',   size: '4.1 GB', minRam: '8 GB',  note: 'solid instruct' },
  // Large — 16 GB RAM
  { id: 'qwen2.5:14b',  size: '9.0 GB', minRam: '16 GB', note: 'high quality' },
  { id: 'gemma3:12b',   size: '8.1 GB', minRam: '16 GB', note: 'Google · high quality' },
]

export const DEFAULT_MODEL_SMALL = 'qwen2.5:3b'
export const DEFAULT_MODEL_LARGE = 'qwen2.5:7b'

export function defaultModelForRam(ramGb: number): string {
  if (ramGb >= 16) return DEFAULT_MODEL_LARGE
  return DEFAULT_MODEL_SMALL
}
