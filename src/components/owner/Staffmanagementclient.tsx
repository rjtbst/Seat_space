'use client'

// src/components/owner/Staffmanagementclient.tsx
import { useState, useTransition, useCallback } from 'react'
import type { StaffMember, PendingRequest } from '@/lib/actions/owner-staff'
import {
  addStaffByPhone, removeStaff, updateStaffRole,
  acceptStaffRequest, rejectStaffRequest,
} from '@/lib/actions/owner-staff'
import { useOwner } from '@/contexts/OwnerContext'
import { useToast } from '@/hooks/useToast'

/* ─── Constants ───────────────────────────────────────────────────────────── */

const ROLE_OPTIONS  = ['staff', 'senior_staff', 'manager'] as const
type Role           = typeof ROLE_OPTIONS[number]

const ROLE_LABELS: Record<Role, string> = {
  staff:        'Staff',
  senior_staff: 'Senior Staff',
  manager:      'Manager',
}

const ROLE_CLASSES: Record<Role, { badge: string; select: string }> = {
  staff:        { badge: 'bg-[#F0F4FF] text-[#3B5BDB]',     select: 'bg-[#F0F4FF] text-[#3B5BDB] border-[#3B5BDB]/20'          },
  senior_staff: { badge: 'bg-[#FEF3E2] text-[#92400E]',     select: 'bg-[#FEF3E2] text-[#92400E] border-[#D97706]/20'           },
  manager:      { badge: 'bg-[#D1FAE5] text-[var(--green)]', select: 'bg-[#D1FAE5] text-[var(--green)] border-[var(--green)]/20' },
}

const AVATAR_COLORS = ['#0D7C54', '#1E5CFF', '#7C3AED', '#C8A84B', '#0597A7']

type Tab = 'staff' | 'requests'

/* ─── Pure helpers ────────────────────────────────────────────────────────── */

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function maskPhone(phone: string | null): string {
  if (!phone) return '—'
  return String(phone).replace(/^(\+?91)?(\d{2})(\d{4})(\d{4})$/, '+91 $2•••• $4')
}

/* ─── Shared atoms (kept Tailwind — matches rest of this file's style) ────── */

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  const idx        = (name.charCodeAt(0) ?? 0) % AVATAR_COLORS.length
  const sizeClass  = { sm: 'w-8 h-8 text-[11px]', md: 'w-9 h-9 text-[12px]', lg: 'w-10 h-10 text-[13px]' }[size]
  return (
    <div
      className={`${sizeClass} rounded-full flex items-center justify-center font-bold text-white shrink-0`}
      style={{ background: AVATAR_COLORS[idx] }}
    >
      {initials(name)}
    </div>
  )
}

// Local Toast kept as Tailwind — uses CSS vars consistent with this file's design system
function LocalToast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div className={`
      fixed bottom-6 right-6 z-[200] px-[18px] py-[10px] rounded-[10px]
      text-[13px] font-semibold text-white shadow-lg animate-[fadeIn_.2s_ease]
      pointer-events-none
      ${ok ? 'bg-[var(--ink)]' : 'bg-[var(--red)]'}
    `}>
      {msg}
    </div>
  )
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-[14px] p-3 bg-[var(--blue-lt)] rounded-[9px] border border-[#1E5CFF]/15 text-[12px] text-[#1447D4] leading-relaxed">
      {children}
    </div>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="flex gap-1.5 items-start bg-[var(--red-lt)] border border-[var(--red)]/20 rounded-[9px] px-3 py-[9px] mb-3 text-[12px] text-[#9B1C1C] leading-relaxed">
      <span className="shrink-0">⚠️</span>
      {message}
    </div>
  )
}

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-[var(--surface)] border border-[var(--divider)] rounded-[14px] shadow-[var(--sh)] overflow-hidden ${className}`}>
      {children}
    </div>
  )
}

function ConfirmRow({
  message, confirmLabel, onConfirm, onCancel, isPending, danger = true,
}: {
  message:      string
  confirmLabel: string
  onConfirm:    () => void
  onCancel:     () => void
  isPending:    boolean
  danger?:      boolean
}) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-[var(--red)] mb-[10px]">{message}</p>
      <div className="flex gap-2">
        <button
          onClick={onCancel}
          disabled={isPending}
          className="flex-1 py-2 rounded-lg border border-[var(--divider)] bg-white text-[var(--ink3)] text-[12px] font-semibold cursor-pointer"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={isPending}
          className={`flex-[2] py-2 rounded-lg border-none text-white text-[13px] font-bold cursor-pointer transition-opacity
            ${danger ? 'bg-[var(--red)]' : 'bg-[var(--green)]'}
            ${isPending ? 'opacity-70' : 'opacity-100'}`}
        >
          {isPending ? 'Processing…' : confirmLabel}
        </button>
      </div>
    </div>
  )
}

/* ─── Sub-components ──────────────────────────────────────────────────────── */

function StaffRow({
  member, isConfirming, isPending,
  onConfirmRemove, onCancelRemove, onRemove, onRoleChange,
}: {
  member:          StaffMember
  isConfirming:    boolean
  isPending:       boolean
  onConfirmRemove: () => void
  onCancelRemove:  () => void
  onRemove:        () => void
  onRoleChange:    (role: string) => void
}) {
  const roleKey = (member.role ?? 'staff') as Role
  const rc      = ROLE_CLASSES[roleKey] ?? ROLE_CLASSES.staff

  return (
    <div className={`px-[18px] py-[14px] transition-colors duration-150 ${isConfirming ? 'bg-[var(--red-lt)]' : ''}`}>
      {isConfirming ? (
        <ConfirmRow
          message={`Remove ${member.fullName} from this library?`}
          confirmLabel={isPending ? 'Removing…' : 'Yes, Remove'}
          onConfirm={onRemove}
          onCancel={onCancelRemove}
          isPending={isPending}
        />
      ) : (
        <div className="flex items-center gap-3">
          <Avatar name={member.fullName} />
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-[var(--ink)] mb-0.5 truncate">{member.fullName}</p>
            <p className="text-[12px] text-[var(--pale)]">{maskPhone(member.phone)}</p>
          </div>
          <select
            value={roleKey}
            onChange={e => onRoleChange(e.target.value)}
            disabled={isPending}
            className={`px-2 py-1 rounded-[7px] border-[1.5px] text-[11px] font-bold cursor-pointer outline-none ${rc.select}`}
          >
            {ROLE_OPTIONS.map(r => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
          <button
            onClick={onConfirmRemove}
            disabled={isPending}
            title="Remove staff"
            className="
              w-[30px] h-[30px] rounded-[7px] border border-[var(--divider)] bg-[var(--surface)]
              text-[var(--pale)] text-[14px] cursor-pointer shrink-0 flex items-center justify-center
              transition-all duration-100
              hover:bg-[var(--red-lt)] hover:border-[var(--red)] hover:text-[var(--red)]
            "
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

function RequestCard({
  req, isConfirming, isPending,
  onAccept, onConfirmReject, onCancelReject, onReject,
}: {
  req:             PendingRequest
  isConfirming:    boolean
  isPending:       boolean
  onAccept:        () => void
  onConfirmReject: () => void
  onCancelReject:  () => void
  onReject:        () => void
}) {
  const dateLabel = req.createdAt
    ? new Date(req.createdAt + '+05:30').toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata',
      })
    : ''

  return (
    <div className={`
      border-[1.5px] rounded-[14px] p-[16px_18px] shadow-[var(--sh)] transition-all duration-150
      ${isConfirming
        ? 'bg-[var(--red-lt)] border-[var(--red)]'
        : 'bg-[var(--surface)] border-[#D97706]/30'}
    `}>
      {isConfirming ? (
        <ConfirmRow
          message={`Decline ${req.fullName}'s request?`}
          confirmLabel={isPending ? 'Declining…' : 'Yes, Decline'}
          onConfirm={onReject}
          onCancel={onCancelReject}
          isPending={isPending}
        />
      ) : (
        <>
          <div className={`flex items-start gap-3 ${req.message ? 'mb-3' : 'mb-[14px]'}`}>
            <Avatar name={req.fullName} size="lg" />
            <div className="flex-1 min-w-0">
              <p className="text-[15px] font-bold text-[var(--ink)] mb-0.5 truncate">{req.fullName}</p>
              <p className="text-[12px] text-[var(--muted)]">{maskPhone(req.phone)}</p>
            </div>
            {dateLabel && (
              <span className="text-[11px] text-[var(--pale)] shrink-0">{dateLabel}</span>
            )}
          </div>

          {req.message && (
            <div className="bg-[#FEF3E2] border border-[#D97706]/20 rounded-lg px-3 py-2 mb-3 text-[12px] text-[#78350F] italic leading-relaxed">
              "{req.message}"
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={onConfirmReject}
              disabled={isPending}
              className={`flex-1 py-[9px] rounded-[9px] border border-[var(--divider)] bg-[var(--surface)]
                text-[var(--muted)] text-[13px] font-semibold cursor-pointer transition-opacity
                ${isPending ? 'opacity-70' : ''}`}
            >
              Decline
            </button>
            <button
              onClick={onAccept}
              disabled={isPending}
              className={`flex-[2] py-[9px] rounded-[9px] border-none bg-[var(--green)] text-white text-[13px]
                font-bold cursor-pointer shadow-[0_2px_10px_rgba(13,124,84,.25)] transition-opacity
                ${isPending ? 'opacity-70' : ''}`}
            >
              {isPending ? 'Accepting…' : '✓ Accept & Add to Staff'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/* ─── Main Component ──────────────────────────────────────────────────────── */

export default function StaffManagementClient({
  staffMembers:    initialStaff,
  pendingRequests: initialRequests,
}: {
  // libraries prop REMOVED — comes from useOwner() context
  staffMembers:    StaffMember[]
  pendingRequests: PendingRequest[]
}) {
  /* Context + toast */
  const { libraries }        = useOwner()
  const { toast, showToast } = useToast(3500)

  /* UI state */
  const [activeTab,    setActiveTab]    = useState<Tab>('staff')
  const [staffMembers, setStaffMembers] = useState(initialStaff)
  const [requests,     setRequests]     = useState(initialRequests)
  const [activeLibId,  setActiveLibId]  = useState(libraries?.[0]?.id ?? '')
  const [isPending,    startTransition] = useTransition()

  /* Form state */
  const [phone,     setPhone]     = useState('')
  const [roleInput, setRoleInput] = useState<Role>('staff')
  const [addError,  setAddError]  = useState('')

  /* Confirm states */
  const [confirmStaffId,   setConfirmStaffId]   = useState<string | null>(null)
  const [confirmRequestId, setConfirmRequestId] = useState<string | null>(null)

  /* Derived */
  const activeLib   = libraries.find(l => l.id === activeLibId)
  const libStaff    = staffMembers.filter(s => s.libraryId === activeLibId)
  const libRequests = requests.filter(r => r.libraryId === activeLibId)

  const resetLibState = useCallback(() => {
    setAddError('')
    setConfirmStaffId(null)
    setConfirmRequestId(null)
  }, [])

  /* ── Handlers (all stable refs via useCallback) ───────────────────────── */

  const handleAdd = useCallback(() => {
    setAddError('')
    if (!phone.trim()) { setAddError('Enter a phone number'); return }
    startTransition(async () => {
      const res = await addStaffByPhone(phone.trim(), activeLibId, roleInput)
      if (res.success) {
        setStaffMembers(prev => [...prev, {
          staffId:   res.data.staffId,
          userId:    '',
          fullName:  res.data.fullName,
          phone:     phone.trim(),
          role:      roleInput,
          libraryId: activeLibId,
        }])
        setPhone('')
        setRoleInput('staff')
        showToast(`✓ ${res.data.fullName} added as ${ROLE_LABELS[roleInput]}`)
      } else {
        setAddError((res as any).error ?? 'Failed to add staff')
      }
    })
  }, [phone, activeLibId, roleInput, showToast])

  const handleRemove = useCallback((staffId: string) => {
    startTransition(async () => {
      const res = await removeStaff(staffId)
      if (res.success) {
        setStaffMembers(prev => prev.filter(s => s.staffId !== staffId))
        setConfirmStaffId(null)
        showToast('Staff member removed')
      } else {
        showToast((res as any).error ?? 'Remove failed', false)
        setConfirmStaffId(null)
      }
    })
  }, [showToast])

  const handleRoleChange = useCallback((staffId: string, newRole: string) => {
    startTransition(async () => {
      const res = await updateStaffRole(staffId, newRole)
      if (res.success) {
        setStaffMembers(prev => prev.map(s => s.staffId === staffId ? { ...s, role: newRole } : s))
        showToast('Role updated')
      } else {
        showToast((res as any).error ?? 'Update failed', false)
      }
    })
  }, [showToast])

  const handleAccept = useCallback((req: PendingRequest) => {
    startTransition(async () => {
      const res = await acceptStaffRequest(req.requestId)
      if (res.success) {
        setRequests(prev => prev.filter(r => r.requestId !== req.requestId))
        setStaffMembers(prev => [...prev, {
          staffId:   res.data.staffId,
          userId:    req.userId,
          fullName:  req.fullName,
          phone:     req.phone,
          role:      'staff',
          libraryId: req.libraryId,
        }])
        showToast(`✓ ${req.fullName} added as staff`)
      } else {
        showToast((res as any).error ?? 'Accept failed', false)
      }
    })
  }, [showToast])

  const handleReject = useCallback((requestId: string) => {
    startTransition(async () => {
      const res = await rejectStaffRequest(requestId)
      if (res.success) {
        setRequests(prev => prev.filter(r => r.requestId !== requestId))
        setConfirmRequestId(null)
        showToast('Request declined')
      } else {
        showToast((res as any).error ?? 'Reject failed', false)
        setConfirmRequestId(null)
      }
    })
  }, [showToast])

  /* ── Render ───────────────────────────────────────────────────────────── */

  return (
    <div className="px-5 py-7 sm:px-8 sm:py-7 max-w-[960px]">

      {/* Toast */}
      {toast && <LocalToast msg={toast.msg} ok={toast.ok !== false} />}

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-extrabold text-[22px] sm:text-[24px] text-[var(--ink)] tracking-[-0.03em] mb-1">
          Staff Management
        </h1>
        <p className="text-[13px] text-[var(--muted)]">
          Manage staff and review join requests across your libraries
        </p>
      </div>

      {/* Library tabs — only shown when owner has multiple libraries */}
      {libraries.length > 1 && (
        <div className="flex flex-wrap gap-1.5 mb-5">
          {libraries.map(lib => {
            const isActive = lib.id === activeLibId
            const count    = staffMembers.filter(s => s.libraryId === lib.id).length
            return (
              <button
                key={lib.id}
                onClick={() => { setActiveLibId(lib.id); resetLibState() }}
                className={`
                  px-4 py-1.5 rounded-full text-[12px] font-semibold border-[1.5px] cursor-pointer
                  transition-all duration-100
                  ${isActive
                    ? 'border-[var(--green)] bg-[#D1FAE5] text-[var(--green)]'
                    : 'border-[var(--divider)] bg-[var(--surface)] text-[var(--muted)]'}
                `}
              >
                {lib.name}
                <span className={`
                  ml-1.5 text-[10px] font-bold px-1.5 py-px rounded-full
                  ${isActive ? 'bg-[var(--green)] text-white' : 'bg-[var(--divider)] text-[var(--pale)]'}
                `}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex mb-5 border border-[var(--divider)] rounded-[10px] overflow-hidden w-fit">
        {([
          { key: 'staff',    label: 'Active Staff',     count: libStaff.length    },
          { key: 'requests', label: 'Pending Requests', count: libRequests.length },
        ] as const).map((tab, i) => {
          const isActive = activeTab === tab.key
          const isAmber  = tab.key === 'requests' && tab.count > 0
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                px-[18px] py-2 text-[13px] font-semibold border-none cursor-pointer
                flex items-center gap-1.5 transition-colors duration-100
                ${i === 0 ? 'border-r border-[var(--divider)]' : ''}
                ${isActive
                  ? isAmber ? 'bg-[#FEF3E2] text-[#D97706]' : 'bg-[#D1FAE5] text-[var(--green)]'
                  : 'bg-[var(--surface)] text-[var(--muted)]'}
              `}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={`
                  text-[11px] font-bold px-[7px] py-px rounded-full
                  ${isActive
                    ? isAmber ? 'bg-[#D97706] text-white' : 'bg-[var(--green)] text-white'
                    : 'bg-[var(--divider)] text-[var(--pale)]'}
                `}>
                  {tab.count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* ══ TAB: ACTIVE STAFF ══════════════════════════════════════════════ */}
      {activeTab === 'staff' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(280px,340px)] gap-5 items-start">

          {/* Staff list */}
          <SectionCard>
            <div className="px-[18px] py-[14px] border-b border-[var(--divider)] flex items-center justify-between">
              <span className="text-[14px] font-bold text-[var(--ink)]">
                {activeLib?.name} — Staff
              </span>
              <span className="text-[12px] text-[var(--pale)]">
                {libStaff.length} member{libStaff.length !== 1 ? 's' : ''}
              </span>
            </div>

            {libStaff.length === 0 ? (
              <div className="text-center px-6 py-12 text-[var(--pale)]">
                <div className="text-[36px] mb-2.5">👥</div>
                <p className="text-[14px] font-semibold text-[var(--ink3)] mb-1.5">No active staff yet</p>
                <p className="text-[12px] leading-relaxed">
                  Add staff directly by phone, or accept a join request from the Pending tab.
                </p>
              </div>
            ) : (
              libStaff.map((member, idx) => (
                <div key={member.staffId} className={idx < libStaff.length - 1 ? 'border-b border-[#F0EDE8]' : ''}>
                  <StaffRow
                    member={member}
                    isConfirming={confirmStaffId === member.staffId}
                    isPending={isPending}
                    onConfirmRemove={() => setConfirmStaffId(member.staffId)}
                    onCancelRemove={() => setConfirmStaffId(null)}
                    onRemove={() => handleRemove(member.staffId)}
                    onRoleChange={role => handleRoleChange(member.staffId, role)}
                  />
                </div>
              ))
            )}
          </SectionCard>

          {/* Add by phone panel */}
          <SectionCard className="!overflow-visible lg:sticky lg:top-5 p-5">
            <p className="text-[14px] font-bold text-[var(--ink)] mb-1">Add Staff Directly</p>
            <p className="text-[12px] text-[var(--muted)] mb-4 leading-relaxed">
              Enter their registered phone number. They must have the <strong>Staff</strong> role
              and a completed profile.
            </p>

            {/* Phone input */}
            <div className="mb-3">
              <label className="text-[11px] font-semibold text-[var(--muted)] block mb-[5px]">
                Phone number
              </label>
              <div className="flex">
                <div className="px-2.5 py-[9px] bg-[var(--bg)] border border-[var(--divider)] border-r-0 rounded-l-[9px] text-[13px] text-[var(--muted)] font-semibold shrink-0">
                  +91
                </div>
                <input
                  value={phone}
                  onChange={e => { setPhone(e.target.value.replace(/\D/g, '').slice(0, 10)); setAddError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleAdd()}
                  placeholder="98765 43210"
                  inputMode="numeric"
                  className="inp rounded-l-none border-l-0 flex-1 !rounded-r-[9px]"
                />
              </div>
            </div>

            {/* Role picker */}
            <div className="mb-4">
              <label className="text-[11px] font-semibold text-[var(--muted)] block mb-[5px]">Role</label>
              <div className="flex gap-1.5">
                {ROLE_OPTIONS.map(r => {
                  const rc = ROLE_CLASSES[r]
                  const borderClass = rc.select.split(' ').find(c => c.startsWith('border-'))
                  return (
                    <button
                      key={r}
                      onClick={() => setRoleInput(r)}
                      className={`
                        flex-1 py-[7px] px-1 rounded-lg border-[1.5px] text-[11px] font-bold
                        cursor-pointer font-[var(--font-dm)] transition-all duration-100
                        ${roleInput === r
                          ? `${rc.badge} ${borderClass}`
                          : 'border-[var(--divider)] bg-[var(--surface)] text-[var(--pale)]'}
                      `}
                    >
                      {ROLE_LABELS[r]}
                    </button>
                  )
                })}
              </div>
            </div>

            {addError && <ErrorBox message={addError} />}

            <button
              onClick={handleAdd}
              disabled={phone.length < 10 || isPending}
              className={`
                w-full py-[11px] rounded-[9px] border-none text-white text-[14px] font-bold
                font-[var(--font-syne)] transition-all duration-100
                ${phone.length === 10
                  ? 'bg-[var(--green)] cursor-pointer shadow-[0_2px_10px_rgba(13,124,84,.25)]'
                  : 'bg-[#C8D4C8] cursor-not-allowed'}
                ${isPending ? 'opacity-70' : ''}
              `}
            >
              {isPending ? 'Adding…' : '+ Add Staff Member'}
            </button>

            <InfoBox>
              💡 Staff must complete onboarding in the app before they can log in.
              After adding, they'll see {activeLib?.name} on their dashboard automatically.
            </InfoBox>
          </SectionCard>
        </div>
      )}

      {/* ══ TAB: PENDING REQUESTS ══════════════════════════════════════════ */}
      {activeTab === 'requests' && (
        <div>
          {libRequests.length === 0 ? (
            <SectionCard className="text-center px-6 py-12">
              <div className="text-[36px] mb-2.5">✅</div>
              <p className="text-[14px] font-semibold text-[var(--ink3)] mb-1.5">No pending requests</p>
              <p className="text-[12px] text-[var(--pale)] leading-relaxed">
                When staff members submit join requests for <strong>{activeLib?.name}</strong>,
                they'll appear here for your review.
              </p>
            </SectionCard>
          ) : (
            <div className="flex flex-col gap-2.5">
              {libRequests.map(req => (
                <RequestCard
                  key={req.requestId}
                  req={req}
                  isConfirming={confirmRequestId === req.requestId}
                  isPending={isPending}
                  onAccept={() => handleAccept(req)}
                  onConfirmReject={() => setConfirmRequestId(req.requestId)}
                  onCancelReject={() => setConfirmRequestId(null)}
                  onReject={() => handleReject(req.requestId)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}