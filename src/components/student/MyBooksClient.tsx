// components/student/MyBooksClient.tsx
'use client'

import { useRouter } from 'next/navigation'
import type { BookIssue } from '@/lib/actions/students/student-books'
import { BookOpen, Calendar, CheckCircle2, AlertCircle, Clock, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtIST } from '@/lib/ist'

function BookIssueCard({ issue }: { issue: BookIssue }) {
  const returned  = !!issue.returned_at
  const overdue   = issue.is_overdue
  const dueMs     = issue.due_date ? new Date(issue.due_date + '+05:30').getTime() : null
  const daysUntilDue = dueMs
    ? Math.ceil((dueMs - Date.now()) / 86_400_000)
    : null

  return (
    <div className={cn(
      'bg-white rounded-xl border overflow-hidden',
      overdue ? 'border-[#FCA5A5]' : 'border-[#E4EAF2]',
    )}>
      {overdue && (
        <div className="h-1 bg-[#FCA5A5]" />
      )}
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
            returned ? 'bg-[#D1FAE5]' : overdue ? 'bg-[#FEE2E2]' : 'bg-[#E8EFFE]',
          )}>
            <BookOpen className={cn(
              'w-[18px] h-[18px]',
              returned ? 'text-[#0D7C54]' : overdue ? 'text-[#C5282C]' : 'text-[#1246FF]',
            )} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-[13px] font-semibold text-[#0D1117] leading-snug line-clamp-2">
                {issue.book_title}
              </h3>
              <span className={cn(
                'text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 flex items-center gap-1',
                returned  ? 'bg-[#D1FAE5] text-[#0D7C54]'  :
                overdue   ? 'bg-[#FEE2E2] text-[#C5282C]'  :
                            'bg-[#E8EFFE] text-[#1246FF]',
              )}>
                {returned  ? <><CheckCircle2 className="w-2.5 h-2.5" />Returned</> :
                 overdue   ? <><AlertCircle  className="w-2.5 h-2.5" />Overdue</>  :
                             <><Clock        className="w-2.5 h-2.5" />Issued</>}
              </span>
            </div>

            {issue.author && (
              <p className="text-[11px] text-[#9AACBE] mt-0.5">by {issue.author}</p>
            )}

            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-1.5 text-[11px] text-[#6E7F94]">
                <Calendar className="w-3 h-3" />
                <span>Issued: {fmtIST(issue.issued_at).split(',').slice(0, 2).join(',')}</span>
              </div>

              {issue.due_date && !returned && (
                <div className={cn(
                  'flex items-center gap-1.5 text-[11px]',
                  overdue ? 'text-[#C5282C] font-semibold' :
                  daysUntilDue !== null && daysUntilDue <= 3 ? 'text-[#D97706] font-medium' :
                  'text-[#6E7F94]',
                )}>
                  <Clock className="w-3 h-3" />
                  <span>
                    Due: {fmtIST(issue.due_date).split(',').slice(0, 2).join(',')}
                    {overdue && ' · OVERDUE'}
                    {!overdue && daysUntilDue !== null && daysUntilDue <= 3 && ` · ${daysUntilDue} day${daysUntilDue !== 1 ? 's' : ''} left`}
                  </span>
                </div>
              )}

              {returned && issue.returned_at && (
                <div className="flex items-center gap-1.5 text-[11px] text-[#0D7C54]">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Returned: {fmtIST(issue.returned_at).split(',').slice(0, 2).join(',')}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {overdue && (
          <div className="mt-3 flex items-start gap-2 bg-[#FEE2E2] rounded-xl p-3">
            <AlertCircle className="w-3.5 h-3.5 text-[#C5282C] flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-[#9B1C1C] leading-relaxed">
              This book is overdue. Please return it to the library as soon as possible to avoid penalties.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default function MyBooksClient({ issues }: { issues: BookIssue[] }) {
  const router  = useRouter()
  const active  = issues.filter((i) => !i.returned_at)
  const overdue = active.filter((i) => i.is_overdue)
  const past    = issues.filter((i) => !!i.returned_at)

  return (
    <div className="p-5 md:p-7 max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-[20px] font-bold text-[#0D1117]">My Borrowed Books</h1>
        <div className="flex items-center gap-3 mt-1">
          {active.length > 0 && (
            <span className="text-[12px] text-[#6E7F94]">
              {active.length} active issue{active.length !== 1 ? 's' : ''}
            </span>
          )}
          {overdue.length > 0 && (
            <span className="text-[11px] font-semibold bg-[#FEE2E2] text-[#C5282C] px-2 py-0.5 rounded-full">
              {overdue.length} overdue
            </span>
          )}
        </div>
      </div>

      {issues.length === 0 ? (
        <div className="flex flex-col items-center py-20 text-center">
          <div className="w-14 h-14 rounded-2xl bg-[#F4F7FB] flex items-center justify-center mb-4">
            <BookOpen className="w-6 h-6 text-[#C4CDD8]" />
          </div>
          <h3 className="text-[14px] font-semibold text-[#0D1117] mb-1">No Books Borrowed</h3>
          <p className="text-[12px] text-[#9AACBE] max-w-xs mb-4">
            Visit a library, request a book, and it will appear here once issued.
          </p>
          <button
            onClick={() => router.push('/explore')}
            className="flex items-center gap-1.5 px-5 py-2.5 bg-[#1246FF] text-white rounded-xl text-[13px] font-semibold hover:bg-[#0E38CC] transition-colors"
          >
            Explore Libraries
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {active.length > 0 && (
            <section>
              <h2 className="text-[11px] font-bold text-[#9AACBE] uppercase tracking-widest mb-3">
                Currently Issued
              </h2>
              <div className="space-y-3">
                {active.map((i) => <BookIssueCard key={i.id} issue={i} />)}
              </div>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 className="text-[11px] font-bold text-[#9AACBE] uppercase tracking-widest mb-3">
                Returned
              </h2>
              <div className="space-y-3">
                {past.map((i) => <BookIssueCard key={i.id} issue={i} />)}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}