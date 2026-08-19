// src/components/shared/ConfirmDialog.tsx
'use client'

/**
 * Shared confirmation dialog — replaces window.confirm() call sites.
 *
 * window.confirm() blocks the JS thread, can't be styled, gets silently
 * suppressed by some mobile browsers, and doesn't match the rest of the
 * app's design system. @radix-ui/react-alert-dialog was already an
 * installed dependency (correct primitive for "are you sure?" flows,
 * distinct from react-dialog's general-purpose modals) but had no wrapper
 * component yet, so call sites fell back to the browser default.
 *
 * Usage — controlled, mirrors the confirm()-then-await-boolean pattern the
 * two existing call sites already used, so swapping in is a small diff:
 *
 *   const [pendingDelete, setPendingDelete] = useState<Book | null>(null)
 *   ...
 *   <ConfirmDialog
 *     open={!!pendingDelete}
 *     title={`Delete "${pendingDelete?.title}"?`}
 *     description="This cannot be undone."
 *     confirmLabel="Delete"
 *     tone="danger"
 *     onConfirm={() => { doDelete(pendingDelete); setPendingDelete(null) }}
 *     onCancel={() => setPendingDelete(null)}
 *   />
 */

import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { ACCENT, RED, TEXT_PRIMARY, TEXT_SECONDARY, FONT_BODY, FONT_DISPLAY } from '@/lib/constants/theme'

type ConfirmDialogProps = {
  open: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'default',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmColor = tone === 'danger' ? RED : ACCENT

  return (
    <AlertDialog.Root open={open} onOpenChange={(next) => { if (!next) onCancel() }}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(10,13,18,.45)',
            zIndex: 300,
            animation: 'fadeIn .15s ease',
          }}
        />
        <AlertDialog.Content
          className="clay-raised"
          style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 'min(420px, calc(100vw - 32px))',
            background: 'var(--clay-surface, #F6F8FC)',
            padding: 22,
            zIndex: 301,
            fontFamily: FONT_BODY,
          }}
        >
          <AlertDialog.Title
            style={{
              margin: 0, marginBottom: description ? 8 : 18,
              fontFamily: FONT_DISPLAY, fontSize: 17, fontWeight: 700,
              color: TEXT_PRIMARY,
            }}
          >
            {title}
          </AlertDialog.Title>

          {description && (
            <AlertDialog.Description
              style={{
                margin: 0, marginBottom: 18,
                fontSize: 13.5, lineHeight: 1.5,
                color: TEXT_SECONDARY,
              }}
            >
              {description}
            </AlertDialog.Description>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                disabled={busy}
                onClick={onCancel}
                className="clay-raised-sm clay-interactive"
                style={{
                  padding: '9px 16px',
                  border: 'none', background: 'var(--clay-surface, #F6F8FC)',
                  color: TEXT_PRIMARY, fontSize: 13, fontWeight: 600,
                  cursor: busy ? 'default' : 'pointer',
                  opacity: busy ? 0.6 : 1,
                }}
              >
                {cancelLabel}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                disabled={busy}
                onClick={onConfirm}
                className="clay-btn-primary"
                style={{
                  padding: '9px 16px',
                  border: 'none',
                  background: tone === 'danger'
                    ? `linear-gradient(155deg, #E5484D, ${confirmColor}, #9B1C1C)`
                    : `linear-gradient(155deg, #4D78FF, ${confirmColor}, #0A5E3F)`,
                  color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: busy ? 'default' : 'pointer',
                  opacity: busy ? 0.7 : 1,
                }}
              >
                {busy ? 'Please wait…' : confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
