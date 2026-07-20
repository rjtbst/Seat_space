'use client'

// src/components/chat/MiniMarkdown.tsx
//
// Deliberately not a full markdown library — chat replies are short, and
// the system prompt already asks the model to avoid heavy formatting (no
// big tables). Covers: paragraphs, bullet/numbered lists, inline `code`,
// and fenced ```code blocks```. Good enough for streaming without a
// re-parse-the-whole-tree cost on every delta.

export function MiniMarkdown({ content }: { content: string }) {
  const blocks = content.split(/```/)

  return (
    <div className="space-y-1.5">
      {blocks.map((block, i) => {
        const isCode = i % 2 === 1
        if (isCode) {
          const [firstLine, ...rest] = block.split('\n')
          const looksLikeLangTag = /^[a-zA-Z0-9_-]{0,12}$/.test(firstLine.trim())
          const code = looksLikeLangTag && rest.length ? rest.join('\n') : block
          return (
            <pre key={i} className="bg-ink text-cream text-[12.5px] rounded-lg p-3 overflow-x-auto">
              <code>{code.trim()}</code>
            </pre>
          )
        }

        return block.split('\n').map((line, j) => {
          const key = `${i}-${j}`
          const trimmedLine = line.trim()

          if (/^[-*•]\s+/.test(trimmedLine)) {
            return (
              <div key={key} className="flex gap-2 text-sm leading-relaxed pl-0.5">
                <span className="text-blue mt-0.5 shrink-0">•</span>
                <span>{renderInline(trimmedLine.replace(/^[-*•]\s+/, ''))}</span>
              </div>
            )
          }
          if (/^\d+\.\s+/.test(trimmedLine)) {
            return (
              <div key={key} className="flex gap-2 text-sm leading-relaxed pl-0.5">
                <span className="text-blue font-medium shrink-0">{trimmedLine.match(/^\d+\./)?.[0]}</span>
                <span>{renderInline(trimmedLine.replace(/^\d+\.\s+/, ''))}</span>
              </div>
            )
          }
          if (trimmedLine === '') return <div key={key} className="h-1" />
          return (
            <p key={key} className="text-sm leading-relaxed">
              {renderInline(line)}
            </p>
          )
        })
      })}
    </div>
  )
}

function renderInline(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g)
  return parts.map((part, idx) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={idx} className="bg-bg text-ink-2 px-1.5 py-0.5 rounded text-[12.5px] font-mono">
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      )
    }
    return <span key={idx}>{part}</span>
  })
}
