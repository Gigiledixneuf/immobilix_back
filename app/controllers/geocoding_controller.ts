import type { HttpContext } from '@adonisjs/core/http'
import { AddressGeocodeValidator, CoordinatesGeocodeValidator } from '#validators/geocoding'
import mapboxService from '#services/mapbox_service'

export default class GeocodingController {
  async address({ request, response }: HttpContext) {
    const payload = await request.validateUsing(AddressGeocodeValidator)
    const results = await mapboxService.forwardGeocode(payload.query, payload.limit ?? 5)

    return response.ok({
      data: results,
    })
  }

  async coordinates({ request, response }: HttpContext) {
    const payload = await request.validateUsing(CoordinatesGeocodeValidator)
    const result = await mapboxService.reverseGeocode(payload.latitude, payload.longitude)

    if (!result) {
      return response.notFound({
        message: 'Adresse introuvable pour ces coordonnées',
      })
    }

    return response.ok({
      data: result,
    })
  }
}
