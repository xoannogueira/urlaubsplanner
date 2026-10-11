/**
 * Fehler aus dem Backend (Problem Details). `fieldErrors` enthält Meldungen pro Feld,
 * z. B. { url: ['Muss ein gültiger http- oder https-Link sein.'] }.
 */
export class ApiError extends Error {
  readonly status: number
  readonly fieldErrors: Record<string, string[]>

  constructor(status: number, message: string, fieldErrors: Record<string, string[]> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.fieldErrors = fieldErrors
  }
}

interface ProblemDetails {
  title?: string
  detail?: string
  errors?: Record<string, string[]>
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...init.headers },
    })
  } catch {
    throw new ApiError(0, 'Server nicht erreichbar. Läuft das Backend?')
  }

  if (response.status === 204) {
    return undefined as T
  }

  const body: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const problem = (body ?? {}) as ProblemDetails
    // 404 ohne Details = das Backend kennt den Pfad nicht – fast immer läuft noch eine alte Version.
    if (response.status === 404 && !problem.detail) {
      throw new ApiError(404, 'Das Backend kennt diese Funktion noch nicht. Bitte das Backend neu starten (nach git pull).')
    }
    throw new ApiError(response.status, problem.detail ?? problem.title ?? `Fehler ${response.status}`, normalizeKeys(problem.errors ?? {}))
  }

  return body as T
}

/** ASP.NET liefert Feldnamen teils großgeschrieben ("Url"); wir vereinheitlichen auf camelCase. */
function normalizeKeys(errors: Record<string, string[]>): Record<string, string[]> {
  return Object.fromEntries(Object.entries(errors).map(([key, value]) => [key.charAt(0).toLowerCase() + key.slice(1), value]))
}

export const json = (data: unknown): RequestInit => ({ body: JSON.stringify(data) })
