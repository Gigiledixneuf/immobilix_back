import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import Property from '#models/property'
import Review from '#models/review'
import PropertyView from '#models/property_view'
import PropertyPhoto from '#models/property_photo'
import { PropertyPhotoService } from '#services/property_photo_service'

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
   * - type: filter by property type (house, apartment, studio, room) - can be comma-separated
   * - minPrice: minimum price filter
   * - maxPrice: maximum price filter
   * - minRooms: minimum number of rooms
   * - minBathrooms: minimum number of bathrooms
   * - minSurface: minimum surface area
   * - maxSurface: maximum surface area
   * - minCapacity: minimum capacity
   * - maxCapacity: maximum capacity
   * - amenities: comma-separated list of amenity names
   */
  async index({ request, response, auth }: HttpContext) {
    try {
      const page = request.input('page', 1)
      const limit = request.input('limit', 10)
      const search = request.input('search', '')
      const city = request.input('city', '')
      const type = request.input('type', '')
      const minPrice = request.input('minPrice')
      const maxPrice = request.input('maxPrice')
      const minRooms = request.input('minRooms')
      const minBathrooms = request.input('minBathrooms')
      const minSurface = request.input('minSurface')
      const maxSurface = request.input('maxSurface')
      const minCapacity = request.input('minCapacity')
      const maxCapacity = request.input('maxCapacity')
      const amenities = request.input('amenities', '')

      // Vérifier si l'utilisateur est authentifié
      const apiAuth = auth.use('api')
      const isAuthenticated = await apiAuth.check()

      let query = Property.query()
        .preload('user', (userQuery) => {
          userQuery.select(['id', 'fullName', 'email', 'portable'])
        })
        .preload('amenities')

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
        logger.debug('Reviews table not available, continuing without reviews preload')
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

    // Filtre par type (support multiple types séparés par virgule)
    if (type) {
      const types = type.split(',').map(t => t.trim()).filter(t => t)
      if (types.length > 0) {
        query.whereIn('type', types)
      }
    }

    // Filtre par prix minimum
    if (minPrice) {
      query.where('price', '>=', Number(minPrice))
    }

    // Filtre par prix maximum
    if (maxPrice) {
      query.where('price', '<=', Number(maxPrice))
    }

    // Filtre par nombre de chambres minimum
    if (minRooms) {
      query.where('rooms', '>=', Number(minRooms))
    }

    // Filtre par nombre de salles de bain minimum
    if (minBathrooms) {
      query.where('bathrooms', '>=', Number(minBathrooms))
    }

    // Filtre par superficie minimum
    if (minSurface) {
      query.where('surface', '>=', Number(minSurface))
    }

    // Filtre par superficie maximum
    if (maxSurface) {
      query.where('surface', '<=', Number(maxSurface))
    }

    // Filtre par capacité minimum
    if (minCapacity) {
      query.where('capacity', '>=', Number(minCapacity))
    }

    // Filtre par capacité maximum
    if (maxCapacity) {
      query.where('capacity', '<=', Number(maxCapacity))
    }

    // Filtre par commodités (si des commodités sont spécifiées)
    if (amenities) {
      const amenityList = amenities.split(',').map(a => a.trim()).filter(a => a)
      if (amenityList.length > 0) {
        // Utiliser une sous-requête pour trouver les propriétés avec au moins une des commodités
        const PropertyAmenity = (await import('#models/property_amenity')).default
        
        // Construire une requête pour trouver les property_id qui ont au moins une des commodités
        const amenityQuery = PropertyAmenity.query()
          .select('property_id')
          .where((builder) => {
            amenityList.forEach((amenity, index) => {
              if (index === 0) {
                builder.whereILike('name', `%${amenity}%`)
              } else {
                builder.orWhereILike('name', `%${amenity}%`)
              }
            })
          })
          .groupBy('property_id')

        const propertyIdsWithAmenities = await amenityQuery
        const ids = propertyIdsWithAmenities.map((pa: any) => pa.property_id)
        
        if (ids.length > 0) {
          query.whereIn('id', ids)
        } else {
          // Si aucune propriété ne correspond, retourner un résultat vide
          query.where('id', 0)
        }
      }
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
        logger.debug('Reviews table not available, continuing without reviews')
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
          // Si c'est un ancien format (juste le nom du fichier), utiliser l'ancien chemin
          if (!imageUrl.includes('/')) {
            imageUrl = `/uploads/properties/${imageUrl}`
          } else {
            // Nouveau format: properties/property_<id>/img_1.jpg
            imageUrl = `/uploads/${imageUrl}`
          }
        }

        return {
          id: property.id,
          name: property.name,
          address: property.address,
          city: property.city,
          type: property.type,
          surface: property.surface,
          rooms: property.rooms,
          bathrooms: property.bathrooms,
          capacity: property.capacity,
          price: property.price,
          description: property.description,
          image: imageUrl,
          createdAt: property.createdAt,
          // Commodités
          amenities: property.amenities ? property.amenities.map((a: any) => ({
            id: a.id,
            name: a.name,
          })) : [],
          // Informations du bailleur (données publiques uniquement pour visiteurs)
          landlord: property.user
            ? {
                id: property.user.id,
                fullName: property.user.fullName,
                // Email et téléphone uniquement pour utilisateurs authentifiés
                ...(isAuthenticated && {
                  email: property.user.email,
                  phone: property.user.portable,
                }),
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
          location: {
            lat: property.latitude,
            lng: property.longitude,
            address: property.formatted_address ?? property.address,
          },
        }
      })

    return response.ok({
      meta: properties.getMeta(),
      data: propertiesWithStats,
    })
    } catch (error) {
      logger.error('Error in PublicPropertiesController.index:', error)
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
  async show({ params, response, auth }: HttpContext) {
    try {
      let query = Property.query()
        .where('id', params.id)
        .preload('user', (userQuery) => {
          userQuery.select(['id', 'fullName', 'email', 'portable'])
        })
        .preload('photos', (photoQuery) => {
          photoQuery.orderBy('display_order', 'asc')
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
        logger.debug('Reviews table not available, continuing without reviews preload')
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
        logger.debug(`Reviews not available for property ${property.id}: ${e}`)
        totalReviews = 0
        averageRating = 0
        reviewsList = []
      }

      // Tracker la vue si l'utilisateur est authentifié
      try {
        // Vérifier si l'utilisateur est authentifié (même pour les routes publiques)
        // Utiliser auth.use('api') pour forcer la vérification du token API
        const apiAuth = auth.use('api')
        const isAuthenticated = await apiAuth.check()
        
        if (isAuthenticated) {
          const user = apiAuth.user
          if (user) {
            logger.debug(`Attempting to track view for user ${user.id}, property ${property.id}`)
            
            // Vérifier si une vue existe déjà aujourd'hui pour éviter les doublons
            const { DateTime } = await import('luxon')
            const today = DateTime.now().startOf('day')
            const tomorrow = today.plus({ days: 1 })

            const existingView = await PropertyView.query()
              .where('userId', user.id)
              .where('propertyId', property.id)
              .where('createdAt', '>=', today.toSQL())
              .where('createdAt', '<', tomorrow.toSQL())
              .first()

            if (!existingView) {
              try {
                const newView = await PropertyView.create({
                  userId: user.id,
                  propertyId: property.id,
                })
                logger.debug(`Property view tracked successfully: user ${user.id}, property ${property.id}, view ID ${newView.id}`)
              } catch (createError: any) {
                logger.error(`Failed to create property view: ${createError?.message || createError}`, createError?.stack)
                // Si c'est une erreur de contrainte unique, c'est OK (vue déjà créée)
                if (createError?.code !== 'ER_DUP_ENTRY' && createError?.code !== 1062) {
                  throw createError
                }
                logger.debug(`Duplicate view detected (already exists): user ${user.id}, property ${property.id}`)
              }
            } else {
              logger.debug(`Property view already exists for today: user ${user.id}, property ${property.id}, view ID ${existingView.id}`)
            }
          } else {
            logger.warn(`auth.use('api').check() returned true but auth.use('api').user is null for property ${property.id}`)
          }
        } else {
          logger.debug(`User not authenticated (auth.use('api').check() = false), skipping view tracking for property ${property.id}`)
        }
      } catch (viewError: any) {
        // Ne pas faire échouer la requête si le tracking échoue
        logger.error(`Could not track property view: ${viewError?.message || viewError}`, viewError?.stack)
      }

    // Vérifier si l'utilisateur est authentifié pour exposer les données sensibles
    const apiAuth = auth.use('api')
    const isAuthenticated = await apiAuth.check()

    // Formater l'URL de l'image principale
    let imageUrl = property.mainPhotoUrl
    if (imageUrl && !imageUrl.startsWith('http')) {
      // Si c'est un ancien format (juste le nom du fichier), utiliser l'ancien chemin
      if (!imageUrl.includes('/')) {
        imageUrl = `/uploads/properties/${imageUrl}`
      } else {
        // Nouveau format: properties/property_<id>/img_1.jpg
        imageUrl = `/uploads/${imageUrl}`
      }
    }

    // Formater les URLs des photos
    const photos = property.photos || []
    const formattedPhotos = photos.map((photo: PropertyPhoto) => {
      let photoUrl = photo.photo_url
      if (photoUrl && !photoUrl.startsWith('http')) {
        // Si c'est un ancien format (juste le nom du fichier), utiliser l'ancien chemin
        if (!photoUrl.includes('/')) {
          photoUrl = `/uploads/properties/${photoUrl}`
        } else {
          // Nouveau format: properties/property_<id>/img_1.jpg
          photoUrl = `/uploads/${photoUrl}`
        }
      }
      return {
        id: photo.id,
        url: photoUrl,
        display_order: photo.display_order,
        is_main: photo.is_main,
      }
    })

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
      photos: formattedPhotos, // Ajouter toutes les photos
      createdAt: property.createdAt,
      // Informations du bailleur (données publiques uniquement pour visiteurs)
      landlord: property.user
        ? {
            id: property.user.id,
            fullName: property.user.fullName,
            // Email et téléphone uniquement pour utilisateurs authentifiés
            ...(isAuthenticated && {
              email: property.user.email,
              phone: property.user.portable,
            }),
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
      location: {
        lat: property.latitude,
        lng: property.longitude,
        address: property.formatted_address ?? property.address,
      },
    })
    } catch (error) {
      logger.error('Error in PublicPropertiesController.show:', error)
      return response.internalServerError({
        message: 'Erreur lors de la récupération de la propriété',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * Récupère toutes les photos d'une propriété
   * GET /api/public/properties/:id/photos
   */
  async photos({ params, response }: HttpContext) {
    try {
      const property = await Property.find(params.id)

      if (!property) {
        return response.notFound({ message: 'Property not found' })
      }

      // Charger les photos de la propriété
      const photos = await PropertyPhoto.query()
        .where('property_id', property.id)
        .orderBy('display_order', 'asc')

      // Formater les URLs des photos
      const formattedPhotos = photos.map((photo) => {
        let photoUrl = photo.photo_url
        if (photoUrl && !photoUrl.startsWith('http')) {
          // Si c'est un ancien format (juste le nom du fichier), utiliser l'ancien chemin
          if (!photoUrl.includes('/')) {
            photoUrl = `/uploads/properties/${photoUrl}`
          } else {
            // Nouveau format: properties/property_<id>/img_1.jpg
            photoUrl = `/uploads/${photoUrl}`
          }
        }
        return {
          id: photo.id,
          url: photoUrl,
          display_order: photo.display_order,
          is_main: photo.is_main,
        }
      })

      return response.ok({
        property_id: property.id,
        photos: formattedPhotos,
        total: formattedPhotos.length,
      })
    } catch (error) {
      logger.error('Error in PublicPropertiesController.photos:', error)
      return response.internalServerError({
        message: 'Erreur lors de la récupération des photos',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  /**
   * Récupère les prix minimum et maximum des propriétés disponibles
   * GET /api/public/properties/price-range
   */
  async priceRange({ response }: HttpContext) {
    try {
      // Approche directe : récupérer toutes les propriétés avec prix > 0 et calculer min/max
      // C'est plus fiable que les requêtes SQL brutes qui peuvent varier selon le driver
      const properties = await Property.query()
        .whereNotNull('price')
        .where('price', '>', 0)

      if (properties.length === 0) {
        // Si aucune propriété disponible, retourner des valeurs par défaut
        return response.ok({
          minPrice: 80,
          maxPrice: 50000,
        })
      }

      // Extraire les prix et filtrer les valeurs invalides
      const prices = properties
        .map((p) => {
          // Convertir en nombre, en gérant les cas où price pourrait être une chaîne ou un décimal
          const price = typeof p.price === 'string' ? parseFloat(p.price) : Number(p.price)
          return price
        })
        .filter((p) => !isNaN(p) && p > 0 && isFinite(p))

      if (prices.length === 0) {
        return response.ok({
          minPrice: 80,
          maxPrice: 50000,
        })
      }

      // Calculer min et max - retourner les vraies valeurs de la base de données
      const minPrice = Math.min(...prices)
      const maxPrice = Math.max(...prices)

      // Log pour déboguer
      logger.debug('Price range calculation:', {
        totalProperties: properties.length,
        validPrices: prices.length,
        minPrice,
        maxPrice,
        samplePrices: prices.slice(0, 10).sort((a, b) => a - b),
      })

      // Retourner les vraies valeurs min/max de la base de données
      // La contrainte de 80$ sera appliquée côté frontend dans le slider
      return response.ok({
        minPrice: minPrice,
        maxPrice: maxPrice,
      })
    } catch (error) {
      logger.error('Error in PublicPropertiesController.priceRange:', error)
      return response.internalServerError({
        message: 'Erreur lors de la récupération de la plage de prix',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
}
