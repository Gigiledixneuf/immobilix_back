import env from '#start/env'
import { Exception } from '@poppinss/utils'

type GeocodeResult = {
  latitude: number
  longitude: number
  formatted_address: string
  address?: string
  street_number?: string
  city?: string
  state?: string
  postal_code?: string
}

type CacheEntry<T> = {
  expiresAt: number
  value: T
}

class MapboxService {
  private readonly baseUrl = 'https://api.mapbox.com/geocoding/v5/mapbox.places'
  private readonly accessToken = env.get('MAPBOX_SECRET_KEY')
  private readonly cache = new Map<string, CacheEntry<GeocodeResult[] | GeocodeResult>>()
  private readonly cacheTtlMs = 5 * 60 * 1000
  private readonly timeoutMs = 8000

  async forwardGeocode(query: string, limit: number = 5): Promise<GeocodeResult[]> {
    const cacheKey = `forward:${query}:${limit}`
    const cached = this.getCache<GeocodeResult[]>(cacheKey)
    if (cached) {
      return cached
    }

    const url = `${this.baseUrl}/${encodeURIComponent(query)}.json`
    const response = await this.fetchJson(url, {
      autocomplete: 'true',
      limit: String(limit),
      language: 'fr',
      country: 'cd',
      types: 'address,neighborhood,locality,place,postcode',
    })

    const features = Array.isArray(response?.features) ? response.features : []
    const results = features.map((feature: any) => this.toGeocodeResult(feature)).filter(Boolean) as GeocodeResult[]
    this.setCache(cacheKey, results)
    return results
  }

  async reverseGeocode(latitude: number, longitude: number): Promise<GeocodeResult | null> {
    const cacheKey = `reverse:${latitude}:${longitude}`
    const cached = this.getCache<GeocodeResult>(cacheKey)
    if (cached) {
      return cached
    }

    const url = `${this.baseUrl}/${longitude},${latitude}.json`
    const response = await this.fetchJson(url, {
      limit: '1',
      language: 'fr',
      country: 'cd',
      types: 'address,neighborhood,locality,place,postcode',
    })

    const feature = Array.isArray(response?.features) ? response.features[0] : null
    if (!feature) {
      return null
    }

    const result = this.toGeocodeResult(feature)
    if (result) {
      this.setCache(cacheKey, result)
      return result
    }

    return null
  }

  private async fetchJson(url: string, params: Record<string, string>) {
    const query = new URLSearchParams({ access_token: this.accessToken, ...params }).toString()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await fetch(`${url}?${query}`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
        },
      })

      if (!response.ok) {
        throw new Exception(`Mapbox request failed with status ${response.status}`, { status: 502 })
      }

      return await response.json()
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new Exception('Mapbox request timeout', { status: 504 })
      }
      throw error
    } finally {
      clearTimeout(timeout)
    }
  }

  private toGeocodeResult(feature: any): GeocodeResult | null {
    if (!feature || !Array.isArray(feature.center) || feature.center.length < 2) {
      return null
    }

    const [lng, lat] = feature.center
    const context = Array.isArray(feature.context) ? feature.context : []

    const placeTypes: string[] = Array.isArray(feature.place_type) ? feature.place_type : []
    const streetNumber = feature.address || feature.properties?.address
    const street = placeTypes.includes('address') ? feature.text : undefined
    const neighborhood =
      context.find((item: any) => String(item.id || '').startsWith('neighborhood.'))?.text ||
      context.find((item: any) => String(item.id || '').startsWith('locality.'))?.text
    const city =
      context.find((item: any) => String(item.id || '').startsWith('district.'))?.text ||
      context.find((item: any) => String(item.id || '').startsWith('place.'))?.text ||
      context.find((item: any) => String(item.id || '').startsWith('locality.'))?.text
    const state = context.find((item: any) => String(item.id || '').startsWith('region.'))?.text
    const postalCode =
      context.find((item: any) => String(item.id || '').startsWith('postcode.'))?.text ||
      neighborhood

    return {
      latitude: Number(lat),
      longitude: Number(lng),
      formatted_address: feature.place_name || '',
      address: street || feature.place_name || '',
      street_number: streetNumber,
      city,
      state,
      postal_code: postalCode,
    }
  }

  private getCache<T>(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) {
      return null
    }
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key)
      return null
    }
    return entry.value as T
  }

  private setCache<T>(key: string, value: T) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.cacheTtlMs,
    })
  }
}

export default new MapboxService()
