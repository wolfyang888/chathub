import { ChatMessageModel } from '~types'
import { uuid } from '~utils'

export const WEB_PROVIDERS = ['chatgpt', 'gemini', 'deepseek', 'doubao'] as const
export type WebProviderId = (typeof WEB_PROVIDERS)[number]

export const WEB_PROVIDER_INFO: Record<WebProviderId, { name: string; url: string }> = {
  chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  gemini: { name: 'Gemini', url: 'https://gemini.google.com/app' },
  deepseek: { name: 'DeepSeek', url: 'https://chat.deepseek.com/' },
  doubao: { name: 'Doubao', url: 'https://www.doubao.com/chat' },
}

export interface PortableMessage {
  id: string
  author: string
  text: string
  createdAt: number
}

export interface PortableThread {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  messages: PortableMessage[]
}

export interface WorkspaceContext {
  fileIndex: Array<{ path: string; size: number }>
  selectedFiles: Array<{ path: string; text: string }>
  omittedFileCount: number
}

const DATABASE_NAME = 'chathub-portable-conversations'
const STORE_NAME = 'threads'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
  })
}

function withStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDatabase().then(
    (database) =>
      new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode)
        const request = operation(transaction.objectStore(STORE_NAME))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        transaction.oncomplete = () => database.close()
        transaction.onerror = () => {
          database.close()
          reject(transaction.error)
        }
      }),
  )
}

export async function loadPortableThreads(): Promise<PortableThread[]> {
  const threads = await withStore<PortableThread[]>('readonly', (store) => store.getAll() as IDBRequest<PortableThread[]>)
  return threads.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function upsertPortableThread(thread: PortableThread) {
  await withStore<IDBValidKey>('readwrite', (store) => store.put(thread))
}

export function createPortableThread(messages: ChatMessageModel[], sourceName: string, previous?: PortableThread): PortableThread {
  const now = Date.now()
  const firstUserMessage = messages.find((message) => message.author === 'user')
  return {
    id: previous?.id || (firstUserMessage ? `portable:${firstUserMessage.id}` : uuid()),
    title: previous?.title || firstUserMessage?.text.slice(0, 72) || 'Untitled conversation',
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    messages: messages
      .filter((message) => message.text.trim())
      .map((message) => ({
        id: message.id,
        author: message.author === 'user' ? 'User' : sourceName,
        text: message.text,
        createdAt: now,
      })),
  }
}

export function buildContextPacket(thread: PortableThread, maxMessages = 8, workspace?: WorkspaceContext): string {
  const messages = thread.messages.slice(-maxMessages)
  const transcript = messages.map((message) => `${message.author.toUpperCase()}: ${message.text}`).join('\n\n')
  const workspacePacket = workspace
    ? [
        '',
        'Local workspace index (metadata only):',
        ...workspace.fileIndex.map((file) => `- ${file.path} (${file.size} bytes)`),
        workspace.omittedFileCount ? `- … ${workspace.omittedFileCount} more files omitted from this index` : '',
        '',
        'User-approved file contents:',
        ...(workspace.selectedFiles.length
          ? workspace.selectedFiles.map((file) => `--- ${file.path} ---\n${file.text}\n--- end ${file.path} ---`)
          : ['(No file contents were approved for this transfer.)']),
      ]
    : []
  return [
    'You are continuing a user-owned cross-model conversation.',
    'Use only the context below. Do not claim to have access to hidden provider memory, files, tools, or earlier messages.',
    '',
    'Recent conversation:',
    transcript || 'No previous messages were saved.',
    ...workspacePacket,
    '',
    'Continue by answering the final user request.',
  ].join('\n')
}
