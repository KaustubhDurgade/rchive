// TODO: Implement when Google exposes a public API or Takeout export format for Gemini
// conversation history. No such API exists as of Phase 1.
export function parseGeminiExport(_filePath: string): never {
  throw new Error('Gemini import not yet supported. Awaiting Google API or Takeout format.')
}
