export function isOpenNowIST(openRaw: string, closeRaw: string): boolean {
  try {
    const d   = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
    const now = d.getHours() * 60 + d.getMinutes()
    const p   = (t: string) => {
      const parts = t.split(':').map(Number)
      return (parts[0] ?? 0) * 60 + (parts[1] ?? 0)
    }
    return now >= p(openRaw) && now < p(closeRaw)
  } catch { return false }
}