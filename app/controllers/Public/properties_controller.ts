import type { HttpContext } from '@adonisjs/core/http'
import Property from '#models/property'
import Review from '#models/review'

export default class PublicPropertiesController {
  /**
   * Display a list of properties with reviews, ratings, and landlord info.
   * GET /api/public/properties
   * 
   * Query parameters:
   * - page: page number (default: 1)
   * - limit: items per page (default: 10)
   * - search: search term (name, city, address)
   * - city: filter by city
   * - type: filter by property type (house, apartment, studio, room)
   * - minPrice: minimum price filter
   * - maxPrice: maximum price filter
   */
  async index({ request, response }: HttpContext) {
    try {
      const page = request.input('page', 1)
      const limit = request.input('limit', 10)
      const search = request.input('search', '')
      const city = request.input('city', '')
      const type = request.input('type', '')
      const minPrice = request.input('minPrice')
      const maxPrice = request.input('maxPrice')

      let query = Property.query()
        .preload('user', (userQuery) => {
          userQuery.select(['id', 'fullName', 'email', 'portable'])
        })

      // Essayer de précharger les reviews, mais ne pas échouer si la table n'existe pas
      try {
        query = query.preload('reviews', (reviewQuery) => {
          reviewQuery
            .preload('user', (userQuery) => {
              userQuery.select(['id', 'fullName'])
            })
            .orderBy('created_at', 'desc')
            .limit(5) // Limiter à 5 derniers commentaires pour la liste
        })
      } catch (e) {
        // Si la table reviews n'existe pas encore, continuer sans précharger
        console.log('Reviews table not available, continuing without reviews preload')
      }

    // Recherche par nom, ville ou adresse
    if (search) {
      query.where((builder) => {
        builder
          .whereILike('name', `%${search}%`)
          .orWhereILike('city', `%${search}%`)
          .orWhereILike('address', `%${search}%`)
      })
    }

    // Filtre par ville
    if (city) {
      query.whereILike('city', `%${city}%`)
    }

    // Filtre par type
    if (type) {
      query.where('type', type)
    }

    // Filtre par prix minimum
    if (minPrice) {
      query.where('price', '>=', Number(minPrice))
    }

    // Filtre par prix maximum
    if (maxPrice) {
      query.where('price', '<=', Number(maxPrice))
    }

    const properties = await query.orderBy('created_at', 'desc').paginate(page, limit)
    const propertyIds = properties.all().map((p) => p.id)

    // OPTIMISATION: Récupérer toutes les reviews en une seule requête (évite N+1)
    let reviewsByProperty: Map<number, any[]> = new Map()
    let reviewStatsByProperty: Map<number, { total: number; average: number }> = new Map()

    if (propertyIds.length > 0) {
      try {
        // Récupérer toutes les reviews pour toutes les propriétés en une requête
        const allReviews = await Review.query()
          .whereIn('property_id', propertyIds)
          .preload('user', (userQuery) => {
            userQuery.select(['id', 'fullName'])
          })
          .orderBy('created_at', 'desc')

        // Grouper les reviews par property_id
        allReviews.forEach((review) => {
          const propId = review.propertyId
          if (!reviewsByProperty.has(propId)) {
            reviewsByProperty.set(propId, [])
          }
          reviewsByProperty.get(propId)!.push(review)
        })

        // Calculer les statistiques pour chaque propriété
        propertyIds.forEach((propId) => {
          const propReviews = reviewsByProperty.get(propId) || []
          const totalReviews = propReviews.length
          const averageRating =
            totalReviews > 0
              ? propReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
              : 0

          reviewStatsByProperty.set(propId, {
            total: totalReviews,
            average: averageRating,
          })
        })
      } catch (e) {
        // Si la table reviews n'existe pas, utiliser des valeurs par défaut
        console.log('Reviews table not available, continuing without reviews')
      }
    }

    // Construire la réponse avec les données pré-chargées
    const propertiesWithStats = properties.all().map((property) => {
      const stats = reviewStatsByProperty.get(property.id) || { total: 0, average: 0 }
      const propertyReviews = reviewsByProperty.get(property.id) || []
      
      // Utiliser les reviews préchargées depuis la relation ou depuis notre Map
      const reviewsList = property.reviews && property.reviews.length > 0 
        ? property.reviews.slice(0, 5) // Limiter à 5 pour la liste
        : propertyReviews.slice(0, 5)

        // Formater l'URL de l'image si elle existe
        let imageUrl = property.mainPhotoUrl
        if (imageUrl && !imageUrl.startsWith('http')) {
          // Si l'image est un chemin relatif, construire l'URL complète
          imageUrl = `/uploads/properties/${imageUrl}`
        }

        return {
          id: property.id,
          name: property.name,
          address: property.address,
          city: property.city,
          type: property.type,
          surface: property.surface,
          rooms: property.rooms,
          capacity: property.capacity,
          price: property.price,
          description: property.description,
          image: imageUrl,
          createdAt: property.createdAt,
          // Informations du bailleur (pour contacter)
          landlord: property.user
            ? {
                id: property.user.id,
                fullName: property.user.fullName,
                email: property.user.email,
                phone: property.user.portable,
              }
            : null,
          // Avis et commentaires
          reviews: {
            averageRating: Math.round(stats.average * 10) / 10, // Arrondir à 1 décimale
            totalReviews: stats.total,
            comments: reviewsList.map((review) => ({
              id: review.id,
              rating: review.rating,
              comment: review.comment,
              author: review.user ? review.user.fullName : 'Anonyme',
              createdAt: review.createdAt,
            })),
          },
        }
      })

    return response.ok({
      meta: properties.getMeta(),
      data: propertiesWithStats,
    })
    } catch (error) {
      console.error('Error in PublicPropertiesController.index:', error)
      return response.internalServerError({
        message: 'Erreur lors de la récupération des propriétés',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * Display a single property with full details.
   * GET /api/public/properties/:id
   */
  async show({ params, response }: HttpContext) {
    try {
      let query = Property.query()
        .where('id', params.id)
        .preload('user', (userQuery) => {
          userQuery.select(['id', 'fullName', 'email', 'portable'])
        })

      // Essayer de précharger les reviews, mais ne pas échouer si la table n'existe pas
      try {
        query = query.preload('reviews', (reviewQuery) => {
          reviewQuery
            .preload('user', (userQuery) => {
              userQuery.select(['id', 'fullName'])
            })
            .orderBy('created_at', 'desc')
        })
      } catch (e) {
        console.log('Reviews table not available, continuing without reviews preload')
      }

      const property = await query.first()

      if (!property) {
        return response.notFound({ message: 'Property not found' })
      }

      // Calculer les statistiques des avis
      let totalReviews = 0
      let averageRating = 0
      let reviewsList: any[] = []

      try {
        const reviews = await Review.query().where('property_id', property.id).select('rating')
        totalReviews = reviews.length
        averageRating =
          totalReviews > 0
            ? reviews.reduce((sum, review) => sum + review.rating, 0) / totalReviews
            : 0
        reviewsList = property.reviews || []
      } catch (e) {
        console.log(`Reviews not available for property ${property.id}: ${e}`)
        totalReviews = 0
        averageRating = 0
        reviewsList = []
      }

    // Formater l'URL de l'image
    let imageUrl = property.mainPhotoUrl
    if (imageUrl && !imageUrl.startsWith('http')) {
      imageUrl = `/uploads/properties/${imageUrl}`
    }

    return response.ok({
      id: property.id,
      name: property.name,
      address: property.address,
      city: property.city,
      type: property.type,
      surface: property.surface,
      rooms: property.rooms,
      capacity: property.capacity,
      price: property.price,
      description: property.description,
      image: imageUrl,
      createdAt: property.createdAt,
      // Informations du bailleur
      landlord: property.user
        ? {
            id: property.user.id,
            fullName: property.user.fullName,
            email: property.user.email,
            phone: property.user.portable,
          }
        : null,
      // Avis et commentaires complets
      reviews: {
        averageRating: Math.round(averageRating * 10) / 10,
        totalReviews: totalReviews,
        comments: reviewsList.map((review) => ({
          id: review.id,
          rating: review.rating,
          comment: review.comment,
          author: review.user ? review.user.fullName : 'Anonyme',
          createdAt: review.createdAt,
        })),
      },
    })
    } catch (error) {
      console.error('Error in PublicPropertiesController.show:', error)
      return response.internalServerError({
        message: 'Erreur lors de la récupération de la propriété',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
}
