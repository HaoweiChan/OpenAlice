export interface RssItem {
  guid?: string
  link?: string
  title?: string
  pubDate?: string
  description?: string
}


export function parseRss(xml: string): RssItem[] {
  const items: RssItem[] = []
  const re = /<item>([\s\S]*?)<\/item>/gi
  let m: RegExpExecArray | null

  while ((m = re.exec(xml)) !== null) {
    const block = m[1]
    const item: RssItem = {
      guid: firstTag(block, 'guid'),
      link: firstTag(block, 'link'),
      title: firstTag(block, 'title'),
      pubDate: firstTag(block, 'pubDate'),
      description: firstTag(block, 'description') ?? firstTag(block, 'content:encoded'),
    }
    items.push(item)
  }

  return items
}


function firstTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${escapeRegExp(tag)}(?:\\s+[^>]*)?>([\\s\\S]*?)<\\/${escapeRegExp(tag)}>`, 'i')
  const m = re.exec(xml)
  if (!m) return undefined
  return decodeCdata(m[1]).trim()
}

function decodeCdata(s: string): string {
  const m = s.match(/^<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>$/)
  return m ? m[1] : s
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
