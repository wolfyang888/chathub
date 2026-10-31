import { ChangeEvent, useMemo, useRef, useState } from 'react'
import { HiOutlineArrowTopRightOnSquare, HiOutlineFolderOpen } from 'react-icons/hi2'
import Browser from 'webextension-polyfill'
import { BotId } from '~app/bots'
import Dialog from '~app/components/Dialog'
import { ChatMessageModel } from '~types'
import {
  buildContextPacket,
  createPortableThread,
  upsertPortableThread,
  WEB_PROVIDER_INFO,
  WEB_PROVIDERS,
  WebProviderId,
  WorkspaceContext,
} from '~services/portable-conversations'
import Button from '../Button'

interface Props {
  botId: BotId
  botName: string
  messages: ChatMessageModel[]
  open: boolean
  onClose: () => void
}

type WorkspaceFile = { path: string; file: File; selected: boolean }

const IGNORE_DIRECTORY = /(^|\/)\.(git|svn|hg)(\/|$)|(^|\/)(node_modules|dist|build|coverage|\.next)(\/|$)/
const IGNORE_FILE = /(^|\/)(\.env(?:\.|$)|.*\.(pem|key|p12|pfx|exe|dll|so|dylib|png|jpe?g|gif|webp|pdf|zip|gz|7z|mp4|mov|mp3|wav))$/i
const MAX_INDEXED_FILES = 200
const MAX_SELECTED_FILE_BYTES = 250 * 1024

const PortableContinueDialog = ({ botName, messages, open, onClose }: Props) => {
  const [status, setStatus] = useState('')
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([])
  const directoryInput = useRef<HTMLInputElement>(null)
  const thread = useMemo(() => createPortableThread(messages, botName), [botName, messages])

  const chooseDirectory = () => directoryInput.current?.click()

  const onDirectoryChosen = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
      .map((file) => ({ path: file.webkitRelativePath || file.name, file, selected: false }))
      .filter(({ path, file }) => !IGNORE_DIRECTORY.test(path) && !IGNORE_FILE.test(path) && file.size <= MAX_SELECTED_FILE_BYTES)
      .sort((a, b) => a.path.localeCompare(b.path))
    setWorkspaceFiles(files)
    setStatus(files.length ? `${files.length} safe text files indexed locally. Select only the files whose contents you want to share.` : 'No eligible text files found. Build output, dependencies, binary files, and .env files are excluded.')
    event.target.value = ''
  }

  const toggleFile = (path: string) => {
    setWorkspaceFiles((files) => files.map((file) => (file.path === path ? { ...file, selected: !file.selected } : file)))
  }

  const createWorkspaceContext = async (): Promise<WorkspaceContext | undefined> => {
    if (!workspaceFiles.length) return undefined
    const selectedFiles = await Promise.all(
      workspaceFiles.filter((item) => item.selected).map(async (item) => ({ path: item.path, text: await item.file.text() })),
    )
    return {
      fileIndex: workspaceFiles.slice(0, MAX_INDEXED_FILES).map((item) => ({ path: item.path, size: item.file.size })),
      selectedFiles,
      omittedFileCount: Math.max(0, workspaceFiles.length - MAX_INDEXED_FILES),
    }
  }

  const continueInWeb = async (provider: WebProviderId) => {
    const workspace = await createWorkspaceContext()
    const packet = buildContextPacket(thread, 8, workspace)
    await upsertPortableThread(thread)
    setStatus(`Opening ${WEB_PROVIDER_INFO[provider].name}…`)
    const url = WEB_PROVIDER_INFO[provider].url
    const tabs = await Browser.tabs.query({ url: `${new URL(url).origin}/*` })
    const tab = tabs[0] || (await Browser.tabs.create({ url }))
    if (!tab.id) {
      setStatus('Could not open the selected website.')
      return
    }
    await Browser.tabs.update(tab.id, { active: true })
    try {
      const result = await Browser.tabs.sendMessage(tab.id, { type: 'portable-fill-draft', text: packet })
      setStatus(result?.ok ? 'Context draft is ready. Review it, then click Send on the website.' : 'Website opened. Wait for it to load, then choose Continue again.')
    } catch {
      setStatus('Website opened. Wait for it to load, then choose Continue again.')
    }
  }

  return (
    <Dialog title="Continue in a web model" open={open} onClose={onClose} className="w-[560px] max-w-full">
      <div className="p-5 flex flex-col gap-4">
        <div className="border-l-2 border-primary-blue pl-3">
          <p className="font-semibold text-primary-text">Portable local context</p>
          <p className="text-sm text-secondary-text mt-1">The last {Math.min(messages.length, 8)} messages are saved locally and prepared as a reviewable draft. Nothing is sent until you press Send on the chosen website.</p>
        </div>
        <input
          ref={directoryInput}
          type="file"
          multiple
          className="hidden"
          onChange={onDirectoryChosen}
          {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
        />
        <div className="rounded-xl border border-primary-border bg-secondary/30 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-primary-text">Workspace context</p>
              <p className="text-xs text-secondary-text mt-0.5">File names are indexed locally first. Contents are sent only for checked files.</p>
            </div>
            <Button text="Choose folder" color="flat" size="tiny" icon={<HiOutlineFolderOpen />} onClick={chooseDirectory} />
          </div>
          {workspaceFiles.length > 0 && (
            <div className="mt-3 max-h-36 overflow-y-auto rounded-lg border border-primary-border bg-primary-background divide-y divide-primary-border">
              {workspaceFiles.slice(0, 100).map((item) => (
                <label key={item.path} className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-xs text-primary-text hover:bg-secondary">
                  <input type="checkbox" checked={item.selected} onChange={() => toggleFile(item.path)} />
                  <span className="truncate font-mono">{item.path}</span>
                  <span className="ml-auto shrink-0 text-light-text">{Math.ceil(item.file.size / 1024)} KB</span>
                </label>
              ))}
              {workspaceFiles.length > 100 && <p className="px-2 py-1.5 text-xs text-secondary-text">Showing the first 100 files. The complete index is still included, capped at {MAX_INDEXED_FILES} files.</p>}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {WEB_PROVIDERS.map((provider) => (
            <Button
              key={provider}
              text={`Continue with ${WEB_PROVIDER_INFO[provider].name}`}
              color="flat"
              className="justify-center border border-primary-border hover:border-primary-blue transition-colors"
              icon={<HiOutlineArrowTopRightOnSquare />}
              onClick={() => continueInWeb(provider)}
            />
          ))}
        </div>
        <p className="min-h-[20px] text-xs text-secondary-text" aria-live="polite">{status || 'Sign in to the chosen site first. ChatHub does not use an API key for this transfer.'}</p>
      </div>
    </Dialog>
  )
}

export default PortableContinueDialog
