/** http(s)-Adresse auf einer anderen Seite als der App selbst – sonst null. */
export function externalUrl(href: string, origin = window.location.origin): string | null {
  try {
    const url = new URL(href, origin)
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.origin !== origin ? url.href : null
  } catch {
    return null
  }
}
