import type { HttpContext } from '@adonisjs/core/http'
import Property from '#models/property'

export default class PublicPropertiesController {
  /**
   * Display a list of properties.
   * GET /properties
   */
  async index({ request, response }: HttpContext) {
    const page = request.input('page', 1)
    const limit = request.input('limit', 10)
    const properties = await Property.query().paginate(page, limit)
    return response.ok(properties)
  }

  /**
   * Display a single property.
   * GET /properties/:id
   */
  async show({ params, response }: HttpContext) {
    const property = await Property.find(params.id)

    if (!property) {
      return response.notFound({ message: 'Property not found' })
    }

    return response.ok(property)
  }
}
