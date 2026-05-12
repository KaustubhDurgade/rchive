import AdmZip from 'adm-zip'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { parseClaudeZip } from '../src/parsers/claude.js'

function buildZip(files: Record<string, unknown>): string {
  const zip = new AdmZip()
  for (const [name, data] of Object.entries(files)) {
    zip.addFile(name, Buffer.from(JSON.stringify(data), 'utf8'))
  }
  const tmpPath = path.join(os.tmpdir(), `rchive-claude-test-${Date.now()}.zip`)
  zip.writeZip(tmpPath)
  return tmpPath
}

const CONV = {
  uuid: 'claude-1',
  name: 'My Claude Chat',
  summary: 'Discussion about testing.',
  created_at: '2026-01-01T10:00:00.000Z',
  updated_at: '2026-01-01T10:05:00.000Z',
  account: { uuid: 'acct-1' },
  chat_messages: [
    {
      uuid: 'm1',
      text: 'What is 2+2?',
      sender: 'human',
      created_at: '2026-01-01T10:01:00.000Z',
      updated_at: '2026-01-01T10:01:00.000Z',
      parent_message_uuid: 'root',
      attachments: [],
      files: [],
    },
    {
      uuid: 'm2',
      text: '4.',
      sender: 'assistant',
      created_at: '2026-01-01T10:02:00.000Z',
      updated_at: '2026-01-01T10:02:00.000Z',
      parent_message_uuid: 'm1',
      attachments: [],
      files: [],
    },
  ],
}

let tmpPath = ''
beforeAll(() => {
  tmpPath = buildZip({ 'conversations.json': [CONV] })
})
afterAll(() => {
  if (tmpPath) fs.unlinkSync(tmpPath)
})

test('parses conversations from conversations.json', () => {
  const convs = parseClaudeZip(tmpPath)
  expect(convs).toHaveLength(1)
  expect(convs[0].provider).toBe('claude')
  expect(convs[0].provider_conversation_id).toBe('claude-1')
  expect(convs[0].title).toBe('My Claude Chat')
  expect(convs[0].summary).toBe('Discussion about testing.')
})

test('parses timestamps correctly', () => {
  const convs = parseClaudeZip(tmpPath)
  expect(convs[0].created_at).toBe(Math.floor(Date.parse('2026-01-01T10:00:00.000Z') / 1000))
  expect(convs[0].updated_at).toBe(Math.floor(Date.parse('2026-01-01T10:05:00.000Z') / 1000))
})

test('maps human→user, assistant→assistant', () => {
  const convs = parseClaudeZip(tmpPath)
  const msgs = convs[0].messages
  expect(msgs).toHaveLength(2)
  expect(msgs[0].role).toBe('user')
  expect(msgs[0].content).toBe('What is 2+2?')
  expect(msgs[1].role).toBe('assistant')
  expect(msgs[1].content).toBe('4.')
})

test('merges projects/ folder and deduplicates by uuid', () => {
  const zip = buildZip({
    'conversations.json': [CONV],
    'projects/proj.json': [CONV],
  })
  try {
    const convs = parseClaudeZip(zip)
    expect(convs).toHaveLength(1)
  } finally {
    fs.unlinkSync(zip)
  }
})

test('skips empty text messages', () => {
  const convWithEmpty = {
    ...CONV,
    uuid: 'claude-2',
    chat_messages: [
      { ...CONV.chat_messages[0], text: '' },
      { ...CONV.chat_messages[1], text: '   ' },
    ],
  }
  const zip = buildZip({ 'conversations.json': [convWithEmpty] })
  try {
    const convs = parseClaudeZip(zip)
    expect(convs[0].messages).toHaveLength(0)
  } finally {
    fs.unlinkSync(zip)
  }
})
