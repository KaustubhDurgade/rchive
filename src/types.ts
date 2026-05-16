export type Provider = 'chatgpt' | 'claude' | 'gemini' | 'claudecode'
export type Role = 'user' | 'assistant'

export interface NormalizedMessage {
  role: Role
  content: string
  created_at: number
}

export interface NormalizedConversation {
  provider: Provider
  provider_conversation_id: string
  title: string
  summary?: string
  created_at: number
  updated_at: number
  messages: NormalizedMessage[]
}
