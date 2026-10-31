import Browser from 'webextension-polyfill'

const EDITOR_SELECTORS = [
  'textarea',
  '[contenteditable="true"]',
  '[role="textbox"]',
]

function findEditor(): HTMLElement | null {
  for (const selector of EDITOR_SELECTORS) {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(selector))
    const editor = elements.find((element) => {
      const style = window.getComputedStyle(element)
      return style.visibility !== 'hidden' && style.display !== 'none' && !element.hasAttribute('disabled')
    })
    if (editor) return editor
  }
  return null
}

function fillDraft(text: string) {
  const editor = findEditor()
  if (!editor) return { ok: false, reason: 'composer-not-found' }

  editor.focus()
  if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(editor, text)
  } else {
    editor.textContent = text
  }
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
  editor.dispatchEvent(new Event('change', { bubbles: true }))
  return { ok: true }
}

Browser.runtime.onMessage.addListener(async (message) => {
  if (message?.type !== 'portable-fill-draft' || typeof message.text !== 'string') return
  return fillDraft(message.text)
})
