import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError } from './client'

const respond = (status: number, body: unknown) =>
  vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }))

describe('api', () => {
  afterEach(() => vi.restoreAllMocks())

  it('erklärt einen unbekannten Pfad als veraltetes Backend', async () => {
    respond(404, { title: 'Not Found', status: 404 })
    const error = await api('/activities').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).message).toContain('Backend neu starten')
  })

  it('zeigt fachliche 404-Meldungen unverändert', async () => {
    respond(404, { title: 'Reise nicht gefunden', detail: 'Reise 123 gibt es nicht.' })
    await expect(api('/trips/123')).rejects.toThrow('Reise 123 gibt es nicht.')
  })
})
