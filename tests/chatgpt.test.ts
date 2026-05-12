import AdmZip from 'adm-zip'
import path from 'path'
import os from 'os'
import fs from 'fs'
import { parseChatGPTZip } from '../src/parsers/chatgpt.js'

function buildFixtureZip(conversations: unknown[]): string {
  const zip = new AdmZip()
  zip.addFile('conversations.json', Buffer.from(JSON.stringify(conversations), 'utf8'))
  const tmpPath = path.join(os.tmpdir(), `rchive-test-${Date.now()}.zip`)
  zip.writeZip(tmpPath)
  return tmpPath
}

const FIXTURE = [
  {
    id: 'conv-1',
    title: 'Test Chat',
    create_time: 1700000000.5,
    update_time: 1700001000.9,
    current_node: 'n3',
    mapping: {
      n1: { id: 'n1', message: null, parent: null, children: ['n2'] },
      n2: {
        id: 'n2',
        message: {
          id: 'm1',
          author: { role: 'user' },
          create_time: 1700000100.0,
          content: { content_type: 'text', parts: ['Hello world'] },
        },
        parent: 'n1',
        children: ['n3'],
      },
      n3: {
        id: 'n3',
        message: {
          id: 'm2',
          author: { role: 'assistant' },
          create_time: 1700000200.0,
          content: { content_type: 'text', parts: ['Hi there!'] },
        },
        parent: 'n2',
        children: [],
      },
    },
  },
]

let tmpPath = ''
beforeAll(() => {
  tmpPath = buildFixtureZip(FIXTURE)
})
afterAll(() => {
  if (tmpPath) fs.unlinkSync(tmpPath)
})

test('parses conversations from ZIP', () => {
  const convs = parseChatGPTZip(tmpPath)
  expect(convs).toHaveLength(1)
  expect(convs[0].provider).toBe('chatgpt')
  expect(convs[0].provider_conversation_id).toBe('conv-1')
  expect(convs[0].title).toBe('Test Chat')
  expect(convs[0].created_at).toBe(1700000000)
  expect(convs[0].updated_at).toBe(1700001000)
})

test('parses messages in tree order', () => {
  const convs = parseChatGPTZip(tmpPath)
  const msgs = convs[0].messages
  expect(msgs).toHaveLength(2)
  expect(msgs[0]).toEqual({ role: 'user', content: 'Hello world', created_at: 1700000100 })
  expect(msgs[1]).toEqual({ role: 'assistant', content: 'Hi there!', created_at: 1700000200 })
})

test('skips messages with null create_time', () => {
  const fixture = [
    {
      ...FIXTURE[0],
      id: 'conv-null',
      mapping: {
        n1: { id: 'n1', message: null, parent: null, children: ['n2'] },
        n2: {
          id: 'n2',
          message: {
            id: 'm1',
            author: { role: 'user' },
            create_time: null,
            content: { content_type: 'text', parts: ['Hello'] },
          },
          parent: 'n1',
          children: [],
        },
      },
      current_node: 'n2',
    },
  ]
  const zip = buildFixtureZip(fixture)
  try {
    const convs = parseChatGPTZip(zip)
    expect(convs[0].messages).toHaveLength(0)
  } finally {
    fs.unlinkSync(zip)
  }
})

test('skips non-user/assistant roles', () => {
  const fixture = [
    {
      ...FIXTURE[0],
      id: 'conv-sys',
      mapping: {
        n1: { id: 'n1', message: null, parent: null, children: ['n2'] },
        n2: {
          id: 'n2',
          message: {
            id: 'm1',
            author: { role: 'system' },
            create_time: 1700000100.0,
            content: { content_type: 'text', parts: ['system msg'] },
          },
          parent: 'n1',
          children: [],
        },
      },
      current_node: 'n2',
    },
  ]
  const zip = buildFixtureZip(fixture)
  try {
    const convs = parseChatGPTZip(zip)
    expect(convs[0].messages).toHaveLength(0)
  } finally {
    fs.unlinkSync(zip)
  }
})
