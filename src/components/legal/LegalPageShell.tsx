// src/components/legal/LegalPageShell.tsx
'use client'

/**
 * Shared shell for Privacy / Terms / Refunds — same header treatment,
 * same "last updated" placement, same sticky section nav, same prose
 * typography. Built once so the three legal pages can't visually drift
 * apart the way duplicated components elsewhere in this app already did
 * (see TimePicker's history) — one shell, three content sets.
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'

export interface LegalSection {
  id:    string
  title: string
  body:  React.ReactNode
}

export function LegalPageShell({
  eyebrow, title, lastUpdated, intro, sections,
}: {
  eyebrow:     string
  title:       string
  lastUpdated: string
  intro?:      React.ReactNode
  sections:    LegalSection[]
}) {
  const [activeId, setActiveId] = useState(sections[0]?.id)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.find(e => e.isIntersecting)
        if (visible) setActiveId(visible.target.id)
      },
      { rootMargin: '-15% 0px -70% 0px' }
    )
    sections.forEach(s => {
      const el = document.getElementById(s.id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [sections])

  return (
    <main className="bg-surface min-h-screen" style={{ paddingTop: 120, paddingBottom: 80 }}>
      <div className="max-w-[1100px] mx-auto px-6 md:px-10">

        {/* Header */}
        <div className="max-w-[640px] mb-14">
          <div className="text-[11px] font-bold tracking-[0.14em] uppercase text-blue mb-3">
            {eyebrow}
          </div>
          <h1 className="font-syne text-[36px] md:text-[44px] font-extrabold text-ink leading-[1.1] mb-4">
            {title}
          </h1>
          <div className="text-[13px] text-pale">Last updated {lastUpdated}</div>
          {intro && (
            <p className="text-[15px] text-muted leading-relaxed mt-5">{intro}</p>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-12">

          {/* Sticky section nav — desktop only */}
          <nav className="hidden lg:block">
            <div className="sticky top-[100px] flex flex-col gap-1">
              {sections.map(s => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={`text-[13px] py-1.5 border-l-2 pl-3 transition-colors ${
                    activeId === s.id
                      ? 'border-blue text-ink font-semibold'
                      : 'border-divider text-muted hover:text-ink'
                  }`}
                >
                  {s.title}
                </a>
              ))}
            </div>
          </nav>

          {/* Content */}
          <div className="max-w-[680px]">
            {sections.map((s, i) => (
              <section key={s.id} id={s.id} className={i > 0 ? 'mt-11 pt-11 border-t border-divider' : ''}>
                <h2 className="font-syne text-[20px] font-bold text-ink mb-3">{s.title}</h2>
                <div className="text-[14.5px] text-ink-2 leading-[1.75] [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:pl-5 [&_ul]:list-disc [&_li]:mb-1.5 [&_strong]:text-ink [&_strong]:font-semibold [&_a]:text-blue [&_a]:underline">
                  {s.body}
                </div>
              </section>
            ))}

            <div className="mt-14 pt-8 border-t border-divider text-[13px] text-pale">
              Questions about this policy?{' '}
              <Link href="/contact" className="text-blue underline">Contact us</Link>.
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
