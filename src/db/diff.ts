import Database from 'better-sqlite3'
import { NormalizedConversation } from '../types.js'
import {
  getConversationByProviderKey,
  insertConversation,
  updateConversation,
  ImportStats,
} from './queries.js'

export function diffAndImport(
  db: Database.Database,
  conversations: NormalizedConversation[]
): ImportStats {
  const stats: ImportStats = { newCount: 0, updatedCount: 0, skippedCount: 0 }

  const importAll = db.transaction((convs: NormalizedConversation[]) => {
    for (const conv of convs) {
      const existing = getConversationByProviderKey(db, conv.provider, conv.provider_conversation_id)
      if (!existing) {
        insertConversation(db, conv)
        stats.newCount++
      } else if (conv.updated_at > (existing.updated_at ?? 0)) {
        updateConversation(db, existing.id, conv)
        stats.updatedCount++
      } else {
        stats.skippedCount++
      }
    }
  })

  importAll(conversations)
  return stats
}
