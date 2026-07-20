import Link from 'next/link'
import { SITE, FOOTER_LINKS } from '@/lib/config'

export default function Footer() {
  return (
    <footer className="bg-ink border-t border-white/5 pt-16 pb-10 px-6 md:px-10">
      <div className="max-w-[1200px] mx-auto">

        {/* Top row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10 mb-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-[9px] bg-blue flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="2" y="2" width="5" height="7" rx="1.5" fill="white" fillOpacity="0.9"/>
                  <rect x="9" y="2" width="5" height="5" rx="1.5" fill="white" fillOpacity="0.6"/>
                  <rect x="2" y="11" width="12" height="3" rx="1.5" fill="white" fillOpacity="0.4"/>
                </svg>
              </div>
              <span className="text-[18px] font-serif text-white">
                Library<span className="text-blue">Space</span>
              </span>
            </Link>
            <p className="text-[13px] text-white/40 leading-relaxed font-light max-w-[200px]">
              Book your study seat. Find libraries. Grow your knowledge.
            </p>
            <div className="flex gap-3 mt-5">
              <a
                href={SITE.social.twitter}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[14px] text-white/50 hover:text-white hover:bg-white/15 transition-colors"
                style={{ background: 'rgba(255,255,255,0.08)' }}
                aria-label="Twitter"
              >𝕏</a>
              <a
                href={SITE.social.instagram}
                target="_blank"
                rel="noopener noreferrer"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[12px] font-bold text-white/50 hover:text-white hover:bg-white/15 transition-colors"
                style={{ background: 'rgba(255,255,255,0.08)' }}
                aria-label="Instagram"
              >IG</a>
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(FOOTER_LINKS).map(([section, links]) => (
            <div key={section}>
              <div className="text-[11px] font-bold tracking-widest uppercase text-white/25 mb-4">
                {section}
              </div>
              <ul className="flex flex-col gap-2.5">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-[13px] text-white/40 hover:text-white/80 transition-colors duration-150"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="h-px bg-white/8 mb-6" />

        {/* Bottom row */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3 text-[12px] text-white/25">
          <span>© {new Date().getFullYear()} StudySpace. All rights reserved.</span>
          <span className="flex items-center gap-1">
            Made with <span className="text-red-400 mx-0.5">♥</span> in Haldwani, UP
          </span>
        </div>
      </div>
    </footer>
  )
}