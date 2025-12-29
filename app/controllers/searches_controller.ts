import type { HttpContext } from '@adonisjs/core/http'
import PropertyView from '#models/property_view'
import Favorite from '#models/favorite'
import Property from '#models/property'

export default class SearchesController {
  /**
   * GET /api/search/recently-viewed
   * Récupère les propriétés consultées récemment par l'utilisateur connecté
   */
  async recentlyViewed({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    try {
      // Récupérer les vues récentes (30 derniers jours, max 50)
      const { DateTime } = await import('luxon')
      const thirtyDaysAgo = DateTime.now().minus({ days: 30 })

      const views = await PropertyView.query()
        .where('userId', user.id)
        .where('createdAt', '>=', thirtyDaysAgo.toSQL())
        .preload('property', (query) => {
          query.preload('user', (userQuery) => {
            userQuery.select(['id', 'fullName', 'email', 'portable'])
          })
          query.preload('photos')
        })
        .orderBy('createdAt', 'desc')
        .limit(50)

      // Grouper par propriété et garder seulement la vue la plus récente
      const uniqueProperties = new Map()
      for (const view of views) {
        if (view.property && !uniqueProperties.has(view.property.id)) {
          uniqueProperties.set(view.property.id, view.property)
        }
      }

      const properties = Array.from(uniqueProperties.values())

      // Formater les propriétés
      const formattedProperties = properties.map((property: Property) => {
        let imageUrl = property.mainPhotoUrl
        if (imageUrl && !imageUrl.startsWith('http')) {
          imageUrl = `/uploads/properties/${imageUrl}`
        }

        return {
          id: property.id,
          userId: property.user_id || 0,
          name: property.name || '',
          address: property.address || '',
          city: property.city || '',
          type: property.type || 'house',
          price: property.price || 0,
          capacity: property.capacity || 0,
          surface: property.surface || null,
          rooms: property.rooms || null,
          bathrooms: property.bathrooms || null,
          mainPhotoUrl: imageUrl || null,
          photos: property.photos?.map((photo) => {
            let photoUrl = photo.url
            if (photoUrl && !photoUrl.startsWith('http')) {
              photoUrl = `/uploads/properties/${photoUrl}`
            }
            return {
              id: photo.id,
              url: photoUrl,
            }
          }) || [],
          amenities: property.amenities?.map((amenity) => ({
            id: amenity.id,
            name: amenity.name,
          })) || [],
          createdAt: property.createdAt?.toISO() || new Date().toISOString(),
          updatedAt: property.updatedAt?.toISO() || new Date().toISOString(),
          user: property.user
            ? {
                id: property.user.id,
                fullName: property.user.fullName,
                email: property.user.email,
                portable: property.user.portable,
              }
            : null,
        }
      })

      console.log(`Found ${formattedProperties.length} recently viewed properties for user ${user.id}`)
      
      return response.ok({
        data: formattedProperties,
        count: formattedProperties.length,
      })
    } catch (error: any) {
      console.error('Error in SearchesController.recentlyViewed:', error)
      return response.internalServerError({
        message: 'Erreur lors de la récupération des propriétés consultées récemment',
        error: error.message || 'Unknown error',
        stack: error.stack,
      })
    }
  }

  /**
   * GET /api/search/favorites
   * Récupère les propriétés favorites de l'utilisateur connecté
   */
  async favorites({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    try {
      const favorites = await Favorite.query()
        .where('user_id', user.id)
        .preload('property', (query) => {
          query.preload('user', (userQuery) => {
            userQuery.select(['id', 'fullName', 'email', 'portable'])
          })
          query.preload('photos')
        })
        .orderBy('created_at', 'desc')

      // Formater les propriétés
      const formattedProperties = favorites.map((favorite) => {
        const property = favorite.property
        if (!property) return null

        let imageUrl = property.mainPhotoUrl
        if (imageUrl && !imageUrl.startsWith('http')) {
          imageUrl = `/uploads/properties/${imageUrl}`
        }

        return {
          id: property.id,
          userId: property.user_id || 0,
          name: property.name || '',
          address: property.address || '',
          city: property.city || '',
          type: property.type || 'house',
          price: property.price || 0,
          capacity: property.capacity || 0,
          surface: property.surface || null,
          rooms: property.rooms || null,
          bathrooms: property.bathrooms || null,
          mainPhotoUrl: imageUrl || null,
          photos: property.photos?.map((photo) => {
            let photoUrl = photo.url
            if (photoUrl && !photoUrl.startsWith('http')) {
              photoUrl = `/uploads/properties/${photoUrl}`
            }
            return {
              id: photo.id,
              url: photoUrl,
            }
          }) || [],
          amenities: property.amenities?.map((amenity) => ({
            id: amenity.id,
            name: amenity.name,
          })) || [],
          createdAt: property.createdAt?.toISO() || new Date().toISOString(),
          updatedAt: property.updatedAt?.toISO() || new Date().toISOString(),
          user: property.user
            ? {
                id: property.user.id,
                fullName: property.user.fullName,
                email: property.user.email,
                portable: property.user.portable,
              }
            : null,
          favoritedAt: favorite.createdAt,
        }
      }).filter(Boolean)

      return response.ok({
        data: formattedProperties,
        count: formattedProperties.length,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'Erreur lors de la récupération des favoris',
        error: error.message,
      })
    }
  }

  /**
   * POST /api/search/favorites/:propertyId
   * Ajouter une propriété aux favoris
   */
  async addFavorite({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    try {
      const propertyId = Number(params.propertyId)
      const property = await Property.find(propertyId)

      if (!property) {
        return response.notFound({ message: 'Propriété introuvable' })
      }

      // Vérifier si déjà en favoris
      const existing = await Favorite.query()
        .where('user_id', user.id)
        .where('property_id', propertyId)
        .first()

      if (existing) {
        return response.ok({
          message: 'Propriété déjà dans les favoris',
          data: { id: existing.id },
        })
      }

      // Ajouter aux favoris
      const favorite = await Favorite.create({
        userId: user.id,
        propertyId: propertyId,
      })

      return response.created({
        message: 'Propriété ajoutée aux favoris',
        data: { id: favorite.id },
      })
    } catch (error) {
      return response.internalServerError({
        message: 'Erreur lors de l\'ajout aux favoris',
        error: error.message,
      })
    }
  }

  /**
   * DELETE /api/search/favorites/:propertyId
   * Retirer une propriété des favoris
   */
  async removeFavorite({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    try {
      const propertyId = Number(params.propertyId)

      const favorite = await Favorite.query()
        .where('user_id', user.id)
        .where('property_id', propertyId)
        .first()

      if (!favorite) {
        return response.notFound({ message: 'Favori introuvable' })
      }

      await favorite.delete()

      return response.ok({
        message: 'Propriété retirée des favoris',
      })
    } catch (error) {
      return response.internalServerError({
        message: 'Erreur lors de la suppression du favori',
        error: error.message,
      })
    }
  }

  /**
   * GET /api/search/favorites/:propertyId/check
   * Vérifier si une propriété est en favoris
   */
  async checkFavorite({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    try {
      const propertyId = Number(params.propertyId)

      const favorite = await Favorite.query()
        .where('user_id', user.id)
        .where('property_id', propertyId)
        .first()

      return response.ok({
        isFavorite: !!favorite,
        favoriteId: favorite?.id || null,
      })
    } catch (error) {
      return response.internalServerError({
        message: 'Erreur lors de la vérification du favori',
        error: error.message,
      })
    }
  }
}
