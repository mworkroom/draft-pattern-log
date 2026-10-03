import { useLayoutEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

export default function AppDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useLayoutEffect(() => {
    const dialog = ref.current!
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog.showModal()
    return () => {
      dialog.close()
      if (opener?.isConnected) opener.focus()
    }
  }, [])

  return createPortal(<dialog ref={ref} className="app-dialog" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onClose() }}
    onClick={event => { if (event.target === event.currentTarget) onClose() }}>
    <div className="dialog-content">
      <header className="dialog-heading"><h2 id={titleId}>{title}</h2>
        <button className="icon-button" type="button" aria-label="닫기" onClick={onClose}><X size={20}/></button>
      </header>
      <div className="dialog-body">{children}</div>
    </div>
  </dialog>, document.body)
}
