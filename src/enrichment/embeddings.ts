import type { FeatureExtractionPipeline } from '@xenova/transformers'

let _pipeline: FeatureExtractionPipeline | null = null

async function getPipeline(): Promise<FeatureExtractionPipeline> {
  if (_pipeline) return _pipeline
  const { pipeline } = await import('@xenova/transformers')
  _pipeline = await pipeline('feature-extraction', 'Xenova/nomic-embed-text-v1') as FeatureExtractionPipeline
  return _pipeline
}

export async function embed(text: string): Promise<Float32Array> {
  const pipe = await getPipeline()
  const output = await pipe(text, { pooling: 'mean', normalize: true })
  // output.data is Float32Array
  return output.data as Float32Array
}
