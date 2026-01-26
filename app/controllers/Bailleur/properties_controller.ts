import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { PropertyValidator } from '#validators/Bailleur/property'
import {
  Step1AddressValidator,
  Step2AvailabilityValidator,
  Step3RentalTimingValidator,
  Step4RentalReasonValidator,
  Step5DescriptionValidator,
  Step6PropertyFactsValidator,
  Step7ContactValidator,
  Step8PhotosAmenitiesValidator,
  CompletePropertyValidator,
} from '#validators/Bailleur/property_step_validator'
import Property from '#models/property'
import { ensureUuid } from '#utils/uuid'
import PropertyPhoto from '#models/property_photo'
import PropertyAmenity from '#models/property_amenity'
import app from '@adonisjs/core/services/app'
import Contract from '#models/contract'
import User from '#models/user'
import { DateTime } from 'luxon'
import { PropertyPhotoService } from '#services/property_photo_service'
import { ImageProcessingService } from '#services/image_processing_service'

export default class PropertiesController {
  /**
   * 🏠 Liste des logements du bailleur connecté
   */
  async index({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'You are not authorized' })

    // ISOLATION STRICTE : Seuls les utilisateurs en mode BAILLEUR peuvent voir leurs propriétés
    if (user.activeRole !== 'landlord') {
      return response.forbidden({ 
        message: 'Vous devez être en mode BAILLEUR pour voir vos propriétés. Changez de rôle dans votre profil.' 
      })
    }

    // Récupérer toutes les propriétés du bailleur (y compris celles en cours de création)
    const properties = await Property.query()
      .where('user_id', user.id)
      .preload('photos')
      .preload('amenities')
      .orderBy('created_at', 'desc') // Plus récentes en premier
    
    // Logger pour débogage
    const logger = (await import('@adonisjs/core/services/logger')).default
    logger.info(`📋 [PROPERTIES INDEX] Récupération des propriétés pour user_id: ${user.id}, nombre trouvé: ${properties.length}`)
    
    return response.ok({ message: 'Liste des logements récupérée', data: properties })
  }

  /**
   * 🧱 Créer un nouveau logement (processus en plusieurs étapes)
   * Cette méthode peut être appelée pour créer une propriété complète ou pour sauvegarder une étape
   */
  async store({ request, auth, response }: HttpContext) {
    // Logger dès le début pour voir si la requête arrive
    const logger = (await import('@adonisjs/core/services/logger')).default
    logger.info(`📝 [PROPERTY STORE] Requête reçue - URL: ${request.url()}, Method: ${request.method()}`)
    
    const user = auth.user
    if (!user) {
      logger.warn(`📝 [PROPERTY STORE] Utilisateur non authentifié`)
      return response.unauthorized({ message: 'You are not authorized' })
    }

    // ISOLATION STRICTE : Seuls les utilisateurs en mode BAILLEUR peuvent créer une propriété
    if (user.activeRole !== 'landlord') {
      logger.warn(`📝 [PROPERTY STORE] Utilisateur ${user.id} n'est pas en mode BAILLEUR`)
      return response.forbidden({ 
        message: 'Vous devez être en mode BAILLEUR pour créer une propriété. Changez de rôle dans votre profil.' 
      })
    }

    // Récupérer step depuis body, query params, ou les deux
    const stepParam = request.input('step') ?? request.qs().step
    // Accepter property_id en snake_case ou camelCase depuis le front (body ou query)
    const propertyId = request.input('property_id') ?? request.input('propertyId') ?? request.qs().property_id ?? request.qs().propertyId
    
    // Convertir step en nombre si c'est une string
    const step = stepParam ? Number(stepParam) : null
    
    // Debug: logger le step reçu avec tous les détails
    logger.info(`📝 [PROPERTY STORE] Step reçu: ${step} (type: ${typeof step}), propertyId: ${propertyId}, userId: ${user.id}`)
    logger.info(`📝 [PROPERTY STORE] Tous les inputs: ${JSON.stringify(request.all())}`)
    logger.info(`📝 [PROPERTY STORE] Body JSON: ${JSON.stringify(request.body())}`)
    logger.info(`📝 [PROPERTY STORE] Query params: ${JSON.stringify(request.qs())}`)

    // Si une propriété existe déjà (création progressive), on la récupère
    let property: Property | null = null
    if (propertyId) {
      property = await Property.query()
        .where('id', propertyId)
        .where('user_id', user.id)
        .first()

      if (!property) {
        logger.warn(`📝 [PROPERTY] Propriété ${propertyId} introuvable pour l'utilisateur ${user.id}`)
        return response.notFound({ message: 'Propriété introuvable' })
      }
      logger.info(`📝 [PROPERTY] Propriété trouvée via property_id: ${property.id}, creation_step: ${property.creation_step}`)
    } else if (step && step > 1) {
      // Si property_id n'est pas fourni mais qu'on est à une étape supérieure à 1,
      // chercher la dernière propriété en cours de création pour cet utilisateur
      logger.info(`📝 [PROPERTY] Récupération automatique pour étape ${step} - propertyId non fourni`)
      
      // 1) priorité aux propriétés incomplètes (creation_step < 8 ou null/0)
      property = await Property.query()
        .where('user_id', user.id)
        .where((query) => {
          query.where('creation_step', '<', 8).orWhereNull('creation_step').orWhere('creation_step', 0)
        })
        .orderBy('created_at', 'desc')
        .first()

      logger.info(`📝 [PROPERTY] Recherche propriétés incomplètes - résultat: ${property ? `trouvée (id: ${property.id}, step: ${property.creation_step})` : 'aucune'}`)

      // 2) si aucune propriété incomplète, on prend la dernière propriété du bailleur
      if (!property) {
        logger.info(`📝 [PROPERTY] Aucune propriété incomplète, recherche de la dernière propriété`)
        property = await Property.query()
          .where('user_id', user.id)
          .orderBy('created_at', 'desc')
          .first()
        
        logger.info(`📝 [PROPERTY] Dernière propriété - résultat: ${property ? `trouvée (id: ${property.id}, step: ${property.creation_step})` : 'aucune'}`)
      }
      
      if (!property) {
        // Log toutes les propriétés de l'utilisateur pour debug
        const allProperties = await Property.query()
          .where('user_id', user.id)
          .select('id', 'name', 'creation_step', 'created_at')
          .orderBy('created_at', 'desc')
        logger.warn(`📝 [PROPERTY] Aucune propriété en cours trouvée. Propriétés de l'utilisateur: ${JSON.stringify(allProperties)}`)
        return response.badRequest({ 
          message: 'Veuillez d\'abord compléter l\'étape 1' 
        })
      }
      
      // Logger pour le debug
      logger.info(`📝 [PROPERTY] Propriété auto-récupérée pour l'étape ${step}: ${property.id}, creation_step: ${property.creation_step}`)
    }

    // Traitement selon l'étape
    switch (step) {
      case 1:
        return await this.handleStep1(request, response, user, property)
      case 2:
        return await this.handleStep2(request, response, user, property)
      case 3:
        return await this.handleStep3(request, response, user, property)
      case 4:
        return await this.handleStep4(request, response, user, property)
      case 5:
        return await this.handleStep5(request, response, user, property)
      case 6:
        return await this.handleStep6(request, response, user, property)
      case 7:
        return await this.handleStep7(request, response, user, property)
      case 8:
        return await this.handleStep8(request, response, user, property)
      default:
        // Si aucune étape n'est spécifiée, on traite comme une création complète
        return await this.handleCompleteCreation(request, response, user)
    }
  }

  /**
   * Étape 1 : Adresse de la propriété
   */
  private async handleStep1(
    request: any,
    response: HttpContext['response'],
    user: User,
    property: Property | null
  ) {
    const logger = (await import('@adonisjs/core/services/logger')).default
    logger.info(`📝 [PROPERTY STEP 1] Début - property est ${property ? `existante (id: ${property.id})` : 'nouvelle'}`)
    
    const payload = await request.validateUsing(Step1AddressValidator)

    if (!property) {
      // Générer un nom unique pour éviter les doublons
      const baseName = `${payload.address}, ${payload.city}`
      let uniqueName = baseName
      let counter = 1
      
      // Vérifier si le nom existe déjà et générer un nom unique
      while (await Property.query().where('name', uniqueName).first()) {
        uniqueName = `${baseName} (${counter})`
        counter++
      }
      
      // Créer une nouvelle propriété
      property = await Property.create({
        address: payload.address,
        street_number: payload.street_number,
        city: payload.city,
        state: payload.state,
        postal_code: payload.postal_code,
        latitude: payload.latitude,
        longitude: payload.longitude,
        formatted_address: payload.formatted_address,
        user_id: user.id,
        creation_step: 1,
        // Valeurs par défaut temporaires
        type: 'apartment',
        surface: 1, // Valeur minimale pour satisfaire la contrainte NOT NULL
        rooms: 1, // Valeur minimale pour satisfaire la contrainte NOT NULL
        capacity: 1,
        price: 0,
        name: uniqueName,
      })
      logger.info(`📝 [PROPERTY STEP 1] Propriété créée - id: ${property.id}, creation_step: ${property.creation_step}`)
    } else {
      // Mettre à jour la propriété existante
      const baseName = `${payload.address}, ${payload.city}`
      let uniqueName = baseName
      
      // Si le nom change, vérifier qu'il n'existe pas déjà
      if (property.name !== baseName) {
        let counter = 1
        while (await Property.query().where('name', uniqueName).where('id', '!=', property.id).first()) {
          uniqueName = `${baseName} (${counter})`
          counter++
        }
      } else {
        uniqueName = property.name // Garder le nom existant si l'adresse n'a pas changé
      }
      
      property.merge({
        address: payload.address,
        street_number: payload.street_number,
        city: payload.city,
        state: payload.state,
        postal_code: payload.postal_code,
        latitude: payload.latitude ?? property.latitude,
        longitude: payload.longitude ?? property.longitude,
        formatted_address: payload.formatted_address ?? property.formatted_address,
        name: uniqueName,
        // Si les champs obligatoires sont manquants, leur donner des valeurs minimales
        surface: property.surface ?? 1,
        rooms: property.rooms ?? 1,
        type: property.type ?? 'apartment',
        capacity: property.capacity ?? 1,
        price: property.price ?? 0,
        creation_step: Math.max(property.creation_step, 1),
      })
      await property.save()
      logger.info(`📝 [PROPERTY STEP 1] Propriété mise à jour - id: ${property.id}, creation_step: ${property.creation_step}`)
    }

    logger.info(`📝 [PROPERTY STEP 1] Réponse envoyée - property.id: ${property.id}, property.creation_step: ${property.creation_step}`)
    return response.ok({
      message: 'Étape 1 sauvegardée avec succès',
      data: { property, step: 1 },
    })
  }

  /**
   * Étape 2 : Disponibilité
   */
  private async handleStep2(
    request: any,
    response: HttpContext['response'],
    user: User,
    property: Property | null
  ) {
    const logger = (await import('@adonisjs/core/services/logger')).default
    logger.info(`📝 [PROPERTY STEP 2] Début - property est ${property ? `trouvée (id: ${property.id}, step: ${property.creation_step})` : 'null'}`)
    
    // Si la propriété n'a pas été trouvée, essayer une dernière fois de la récupérer
    if (!property) {
      logger.warn(`📝 [PROPERTY STEP 2] Propriété null pour l'utilisateur ${user.id}, tentative de récupération`)
      
      // Dernière tentative : chercher la dernière propriété créée par cet utilisateur
      property = await Property.query()
        .where('user_id', user.id)
        .where((query) => {
          query.where('creation_step', '<', 8).orWhereNull('creation_step').orWhere('creation_step', 0)
        })
        .orderBy('created_at', 'desc')
        .first()
      
      if (!property) {
        // Log toutes les propriétés pour debug
        const allProps = await Property.query()
          .where('user_id', user.id)
          .select('id', 'name', 'creation_step', 'created_at')
          .orderBy('created_at', 'desc')
        logger.error(`📝 [PROPERTY STEP 2] Aucune propriété trouvée. Toutes les propriétés de l'utilisateur: ${JSON.stringify(allProps)}`)
        return response.badRequest({ message: 'Veuillez d\'abord compléter l\'étape 1' })
      }
      
      logger.info(`📝 [PROPERTY STEP 2] Propriété récupérée en dernier recours: ${property.id}, step: ${property.creation_step}`)
    }

    logger.info(`📝 [PROPERTY STEP 2] Validation des données - available_from: ${request.input('available_from')}, available_time: ${request.input('available_time')}`)
    
    const payload = await request.validateUsing(Step2AvailabilityValidator)
    
    logger.info(`📝 [PROPERTY STEP 2] Validation réussie - payload: ${JSON.stringify(payload)}`)
    logger.info(`📝 [PROPERTY STEP 2] Type de available_from: ${typeof payload.available_from}, valeur: ${payload.available_from}`)

    // Convertir available_from en DateTime de Luxon
    // Le validateur Vine retourne une Date JavaScript, on doit la convertir en DateTime de Luxon
    let availableFrom: DateTime | undefined
    if (payload.available_from) {
      if (payload.available_from instanceof DateTime) {
        availableFrom = payload.available_from
      } else if (payload.available_from instanceof Date) {
        availableFrom = DateTime.fromJSDate(payload.available_from)
      } else if (typeof payload.available_from === 'string') {
        availableFrom = DateTime.fromISO(payload.available_from)
        if (!availableFrom.isValid) {
          logger.error(`📝 [PROPERTY STEP 2] Erreur de parsing de la date: ${availableFrom.invalidReason}`)
          return response.badRequest({ message: 'Date invalide' })
        }
      } else {
        logger.error(`📝 [PROPERTY STEP 2] Type inattendu pour available_from: ${typeof payload.available_from}`)
        return response.badRequest({ message: 'Format de date invalide' })
      }
    }

    logger.info(`📝 [PROPERTY STEP 2] DateTime converti: ${availableFrom?.toISO()}`)

    property.merge({
      available_from: availableFrom,
      available_time: payload.available_time,
      creation_step: Math.max(property.creation_step, 2),
    })
    await property.save()
    
    logger.info(`📝 [PROPERTY STEP 2] Propriété sauvegardée - id: ${property.id}, creation_step: ${property.creation_step}`)

    return response.ok({
      message: 'Étape 2 sauvegardée avec succès',
      data: { property, step: 2 },
    })
  }

  /**
   * Étape 3 : Quand voulez-vous louer ?
   */
  private async handleStep3(
    request: any,
    response: HttpContext['response'],
    user: User,
    property: Property | null
  ) {
    if (!property) {
      return response.badRequest({ message: 'Veuillez d\'abord compléter l\'étape 1' })
    }

    const payload = await request.validateUsing(Step3RentalTimingValidator)

    // On peut stocker cette information dans additional_info ou créer un champ dédié
    property.merge({
      creation_step: Math.max(property.creation_step, 3),
    })
    await property.save()

    return response.ok({
      message: 'Étape 3 sauvegardée avec succès',
      data: { property, step: 3, rental_timing: payload.rental_timing },
    })
  }

  /**
   * Étape 4 : Raison de la location
   */
  private async handleStep4(
    request: any,
    response: HttpContext['response'],
    user: User,
    property: Property | null
  ) {
    if (!property) {
      return response.badRequest({ message: 'Veuillez d\'abord compléter l\'étape 1' })
    }

    const payload = await request.validateUsing(Step4RentalReasonValidator)

    property.merge({
      rental_reason: payload.rental_reason,
      rental_reason_other: payload.rental_reason_other,
      creation_step: Math.max(property.creation_step, 4),
    })
    await property.save()

    return response.ok({
      message: 'Étape 4 sauvegardée avec succès',
      data: { property, step: 4 },
    })
  }

  /**
   * Étape 5 : Description
   */
  private async handleStep5(
    request: any,
    response: HttpContext['response'],
    user: User,
    property: Property | null
  ) {
    if (!property) {
      return response.badRequest({ message: 'Veuillez d\'abord compléter l\'étape 1' })
    }

    const payload = await request.validateUsing(Step5DescriptionValidator)

    property.merge({
      description: payload.description,
      creation_step: Math.max(property.creation_step, 5),
    })
    await property.save()

    return response.ok({
      message: 'Étape 5 sauvegardée avec succès',
      data: { property, step: 5 },
    })
  }

  /**
   * Étape 6 : Caractéristiques du logement
   */
  private async handleStep6(
    request: any,
    response: HttpContext['response'],
    user: User,
    property: Property | null
  ) {
    if (!property) {
      return response.badRequest({ message: 'Veuillez d\'abord compléter l\'étape 1' })
    }

    const payload = await request.validateUsing(Step6PropertyFactsValidator)

    // Générer un nom unique si nécessaire
    const name = property.name || `${payload.type} - ${payload.rooms} pièces, ${payload.surface}m²`

    property.merge({
      name,
      type: payload.type,
      property_use_type: payload.property_use_type,
      surface: payload.surface,
      land_size: payload.land_size,
      year_built: payload.year_built,
      rooms: payload.rooms,
      bathrooms: payload.bathrooms,
      security_deposit: payload.security_deposit,
      deposit_months: payload.deposit_months,
      price: payload.price,
      capacity: payload.rooms || 1, // Capacité par défaut basée sur le nombre de pièces
      creation_step: Math.max(property.creation_step, 6),
    })
    await property.save()

    return response.ok({
      message: 'Étape 6 sauvegardée avec succès',
      data: { property, step: 6 },
    })
  }

  /**
   * Étape 7 : Contact
   */
  private async handleStep7(
    request: any,
    response: HttpContext['response'],
    user: User,
    property: Property | null
  ) {
    if (!property) {
      return response.badRequest({ message: 'Veuillez d\'abord compléter l\'étape 1' })
    }

    const payload = await request.validateUsing(Step7ContactValidator)

    property.merge({
      contact_phone: payload.contact_phone,
      additional_info: payload.additional_info,
      creation_step: Math.max(property.creation_step, 7),
    })
    await property.save()

    return response.ok({
      message: 'Étape 7 sauvegardée avec succès',
      data: { property, step: 7 },
    })
  }

  /**
   * Étape 8 : Photos et commodités
   */
  private async handleStep8(
    request: any,
    response: HttpContext['response'],
    user: User,
    property: Property | null
  ) {
    const logger = (await import('@adonisjs/core/services/logger')).default
    logger.info(`📝 [PROPERTY STEP 8] Début - property est ${property ? `trouvée (id: ${property.id}, step: ${property.creation_step})` : 'null'}`)
    
    if (!property) {
      return response.badRequest({ message: 'Veuillez d\'abord compléter l\'étape 1' })
    }

    // Log les fichiers reçus avant validation
    logger.info(`📝 [PROPERTY STEP 8] Fichiers reçus: ${JSON.stringify(request.allFiles())}`)
    logger.info(`📝 [PROPERTY STEP 8] Inputs: ${JSON.stringify(request.all())}`)

    const payload = await request.validateUsing(Step8PhotosAmenitiesValidator)
    
    logger.info(`📝 [PROPERTY STEP 8] Validation réussie - ${payload.photos.length} photos, ${payload.amenities?.length || 0} commodités`)

    // Traiter les photos avec compression et optimisation
    const photoFiles = payload.photos
    const uploadedPhotos: PropertyPhoto[] = []

    // S'assurer que le dossier de la propriété existe
    await PropertyPhotoService.ensurePropertyFolderExists(property.id)

    try {
      for (let i = 0; i < photoFiles.length; i++) {
        const photoFile = photoFiles[i]
        
        // 1. Valider la taille du fichier
        const isValidSize = await ImageProcessingService.validateFileSize(photoFile.tmpPath!)
        if (!isValidSize) {
          throw new Error(
            `L'image ${i + 1} est trop grande. Taille maximale autorisée: 5MB`
          )
        }

        // 2. Générer les noms de fichiers (standard + thumbnail)
        const standardFileName = `img_${i + 1}.jpg`
        const thumbnailFileName = `thumb_${i + 1}.jpg`

        // 3. Chemins complets
        const propertyFolderPath = PropertyPhotoService.getPropertyFolderFullPath(property.id)
        const tempFilePath = photoFile.tmpPath!
        const standardFilePath = PropertyPhotoService.getPhotoFullPath(property.id, standardFileName)
        const thumbnailFilePath = PropertyPhotoService.getPhotoFullPath(property.id, thumbnailFileName)

        // 4. Traiter l'image : compression + redimensionnement + suppression EXIF
        try {
          await ImageProcessingService.processImageWithThumbnail(
            tempFilePath,
            standardFilePath,
            thumbnailFilePath
          )
        } catch (processError: any) {
          logger.error(
            `[PROPERTY STEP 8] Erreur lors du traitement de l'image ${i + 1}: ${processError.message}`
          )
          throw new Error(
            `Erreur lors du traitement de l'image ${i + 1}: ${processError.message || "Format d'image non supporté ou corrompu"}`
          )
        }

        // 5. Stocker le chemin relatif dans la base de données (format standard)
        // Format: properties/property_<propertyId>/img_<index>.jpg
        const photoRelativePath = `${PropertyPhotoService.getPropertyFolderPath(property.id)}/${standardFileName}`

        const photo = await PropertyPhoto.create({
          property_id: property.id,
          photo_url: photoRelativePath, // Stocker le chemin relatif complet
          display_order: i,
          is_main: i === 0, // La première photo est la photo principale
        })

        uploadedPhotos.push(photo)

        // Mettre à jour mainPhotoUrl si c'est la première photo
        if (i === 0) {
          property.mainPhotoUrl = photoRelativePath
        }
      }
    } catch (error: any) {
      // En cas d'erreur, nettoyer les fichiers partiellement uploadés
      logger.error(`[PROPERTY STEP 8] Erreur lors du traitement des photos: ${error.message}`)
      
      // Supprimer les photos déjà uploadées
      for (const uploadedPhoto of uploadedPhotos) {
        try {
          await uploadedPhoto.delete()
        } catch {
          // Ignorer les erreurs de suppression
        }
      }

      // Retourner une erreur claire
      return response.badRequest({
        message: error.message || 'Erreur lors du traitement des images',
        code: 'IMAGE_PROCESSING_ERROR',
      })
    }

    // Traiter les commodités
    // Le validateur transforme déjà les commodités en tableau (string JSON ou tableau)
    const amenitiesList: string[] = Array.isArray(payload.amenities) ? payload.amenities : []

    if (amenitiesList.length > 0) {
      logger.info(`📝 [PROPERTY STEP 8] Traitement de ${amenitiesList.length} commodités`)
      // Supprimer les commodités existantes
      await PropertyAmenity.query().where('property_id', property.id).delete()

      // Créer les nouvelles commodités
      for (const amenityName of amenitiesList) {
        await PropertyAmenity.create({
          property_id: property.id,
          name: amenityName,
        })
      }
    }

    // Finaliser la création
    property.creation_step = 8
    await property.save()

    logger.info(`📝 [PROPERTY STEP 8] Propriété finalisée - id: ${property.id}, creation_step: ${property.creation_step}`)

    // Charger les relations
    await property.load('photos')
    await property.load('amenities')

    logger.info(`📝 [PROPERTY STEP 8] Photos chargées: ${property.photos.length}, Commodités: ${property.amenities.length}`)

    return response.created({
      message: 'Logement créé avec succès !',
      data: property,
    })
  }

  /**
   * Création complète en une seule fois (pour compatibilité)
   */
  private async handleCompleteCreation(
    request: any,
    response: HttpContext['response'],
    user: User
  ) {
    const payload = await request.validateUsing(CompletePropertyValidator)

    // Générer un nom unique
    const name =
      payload.name || `${payload.type} - ${payload.rooms} pièces, ${payload.surface}m²`

    // Créer la propriété
    const property = await Property.create({
      name,
      address: payload.address,
      street_number: payload.street_number,
      city: payload.city,
      state: payload.state,
      postal_code: payload.postal_code,
      latitude: payload.latitude,
      longitude: payload.longitude,
      formatted_address: payload.formatted_address,
      type: payload.type,
      property_use_type: payload.property_use_type,
      surface: payload.surface,
      land_size: payload.land_size,
      year_built: payload.year_built,
      rooms: payload.rooms,
      bathrooms: payload.bathrooms,
      security_deposit: payload.security_deposit,
      deposit_months: payload.deposit_months,
      capacity: payload.rooms || 1,
      price: payload.price,
      description: payload.description,
      available_from: payload.available_from,
      rental_reason: payload.rental_reason,
      rental_reason_other: payload.rental_reason_other,
      contact_phone: payload.contact_phone,
      additional_info: payload.additional_info,
      user_id: user.id,
      creation_step: 8,
    })

    // Traiter les photos avec compression et optimisation
    const photoFiles = payload.photos
    
    // S'assurer que le dossier de la propriété existe
    await PropertyPhotoService.ensurePropertyFolderExists(property.id)
    
    const uploadedPhotos: PropertyPhoto[] = []
    
    try {
      for (let i = 0; i < photoFiles.length; i++) {
        const photoFile = photoFiles[i]
        
        // 1. Valider la taille du fichier
        const isValidSize = await ImageProcessingService.validateFileSize(photoFile.tmpPath!)
        if (!isValidSize) {
          throw new Error(
            `L'image ${i + 1} est trop grande. Taille maximale autorisée: 5MB`
          )
        }

        // 2. Générer les noms de fichiers (standard + thumbnail)
        const standardFileName = `img_${i + 1}.jpg`
        const thumbnailFileName = `thumb_${i + 1}.jpg`

        // 3. Chemins complets
        const tempFilePath = photoFile.tmpPath!
        const standardFilePath = PropertyPhotoService.getPhotoFullPath(property.id, standardFileName)
        const thumbnailFilePath = PropertyPhotoService.getPhotoFullPath(property.id, thumbnailFileName)

        // 4. Traiter l'image : compression + redimensionnement + suppression EXIF
        try {
          await ImageProcessingService.processImageWithThumbnail(
            tempFilePath,
            standardFilePath,
            thumbnailFilePath
          )
        } catch (processError: any) {
          logger.error(
            `[PROPERTY COMPLETE] Erreur lors du traitement de l'image ${i + 1}: ${processError.message}`
          )
          throw new Error(
            `Erreur lors du traitement de l'image ${i + 1}: ${processError.message || "Format d'image non supporté ou corrompu"}`
          )
        }

        // 5. Stocker le chemin relatif dans la base de données
        const photoRelativePath = `${PropertyPhotoService.getPropertyFolderPath(property.id)}/${standardFileName}`

        const photo = await PropertyPhoto.create({
          property_id: property.id,
          photo_url: photoRelativePath,
          display_order: i,
          is_main: i === 0,
        })

        uploadedPhotos.push(photo)

        if (i === 0) {
          property.mainPhotoUrl = photoRelativePath
          await property.save()
        }
      }
    } catch (error: any) {
      // En cas d'erreur, nettoyer les fichiers partiellement uploadés et la propriété
      const logger = (await import('@adonisjs/core/services/logger')).default
      logger.error(`[PROPERTY COMPLETE] Erreur lors du traitement des photos: ${error.message}`)
      
      // Supprimer les photos déjà uploadées
      for (const uploadedPhoto of uploadedPhotos) {
        try {
          await uploadedPhoto.delete()
        } catch {
          // Ignorer les erreurs de suppression
        }
      }
      
      // Supprimer la propriété créée
      try {
        await property.delete()
      } catch {
        // Ignorer si la propriété n'a pas pu être supprimée
      }

      return response.badRequest({
        message: error.message || 'Erreur lors du traitement des images',
        code: 'IMAGE_PROCESSING_ERROR',
      })
    }

    // Traiter les commodités
    if (payload.amenities && payload.amenities.length > 0) {
      for (const amenityName of payload.amenities) {
        await PropertyAmenity.create({
          property_id: property.id,
          name: amenityName,
        })
      }
    }

    // Charger les relations
    await property.load('photos')
    await property.load('amenities')

    return response.created({
      message: 'Logement créé avec succès',
      data: property,
    })
  }

  /**
   * 🔎 Afficher un logement (bailleur ou locataire)
   */
  async show({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'You are not authorized' })
    }

    // On précharge les informations du bailleur (user), photos et commodités.
    const property = await Property.query()
      .where('id', params.id)
      .preload('user')
      .preload('photos')
      .preload('amenities')
      .first()

    if (!property) {
      return response.notFound({ message: 'Logement introuvable' })
    }

    // ISOLATION STRICTE : Vérifier l'accès selon le rôle actif
    if (!user.activeRole) {
      return response.forbidden({
        message: 'Aucun rôle actif défini. Veuillez sélectionner un rôle dans votre profil.',
      })
    }

    let hasAccess = false

    if (user.activeRole === 'landlord') {
      // En mode BAILLEUR : voir seulement ses propres propriétés
      hasAccess = user.id === property.user_id
    } else if (user.activeRole === 'tenant') {
      // En mode LOCATAIRE : voir les propriétés où il a un contrat
      const contract = await Contract.query()
        .where('property_id', property.id)
        .where('tenant_id', user.id)
        .first()
      hasAccess = !!contract
    }

    if (!hasAccess) {
      return response.forbidden({ message: "Vous n'avez pas accès à ce logement" })
    }

    // On s'assure de ne retourner que les informations publiques du bailleur
    const ownerDetails = property.user.serialize()

    const propertyData = {
      ...property.serialize(),
      user: {
        id: ownerDetails.id,
        fullName: ownerDetails.fullName,
        email: ownerDetails.email,
        portable: ownerDetails.portable,
      },
      location: {
        lat: property.latitude,
        lng: property.longitude,
        address: property.formatted_address ?? property.address,
      },
    }

    // La réponse inclut maintenant les données du logement et celles du bailleur
    return response.ok({ message: 'Détails du logement', data: propertyData })
  }

  /**
   * ✏️ Modifier un logement (support multi-step comme store)
   */
  async update({ params, request, auth, response }: HttpContext) {
    const logger = (await import('@adonisjs/core/services/logger')).default
    logger.info(`📝 [PROPERTY UPDATE] Requête reçue - ID: ${params.id}, Method: ${request.method()}`)
    
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'You are not authorized' })

    ensureUuid(params.id, 'UUID de propriété invalide')
    const property = await Property.findBy('uuid', params.id)
    if (!property) return response.notFound({ message: 'Logement introuvable' })
    if (property.user_id !== user.id)
      return response.forbidden({ message: "Vous n'avez pas accès à ce logement" })

    // Récupérer step depuis body ou query params (comme dans store)
    const stepParam = request.input('step') ?? request.qs().step
    const step = stepParam ? Number(stepParam) : null

    logger.info(`📝 [PROPERTY UPDATE] Step reçu: ${step}, propertyId: ${params.id}`)

    // Si un step est fourni, utiliser la logique multi-step
    if (step) {
      return await this.handleUpdateStep(step, request, response, user, property)
    }

    // Sinon, utiliser l'ancienne méthode de mise à jour complète
    const payload = await request.validateUsing(PropertyValidator)

    let fileName: string | undefined
    if (payload.main_photo_url) {
      await payload.main_photo_url.move(app.makePath('uploads/properties'))
      fileName = payload.main_photo_url.fileName
    }

    property.merge({
      name: payload.name,
      address: payload.address,
      city: payload.city,
      type: payload.type,
      surface: payload.surface ?? property.surface,
      rooms: payload.rooms ?? property.rooms,
      capacity: payload.capacity ?? property.capacity,
      price: payload.price ?? property.price,
      description: payload.description ?? property.description,
      latitude: payload.latitude ?? property.latitude,
      longitude: payload.longitude ?? property.longitude,
      formatted_address: payload.formatted_address ?? property.formatted_address,
      mainPhotoUrl: fileName ?? property.mainPhotoUrl,
    })

    await property.save()

    return response.ok({
      message: 'Logement mis à jour avec succès',
      data: property,
    })
  }

  /**
   * Gérer la mise à jour par étape (similaire à handleStepX mais pour update)
   */
  private async handleUpdateStep(
    step: number,
    request: any,
    response: HttpContext['response'],
    user: User,
    property: Property
  ) {
    const logger = (await import('@adonisjs/core/services/logger')).default
    
    switch (step) {
      case 1:
        return await this.handleUpdateStep1(request, response, property)
      case 2:
        return await this.handleUpdateStep2(request, response, property)
      case 3:
        return await this.handleUpdateStep3(request, response, property)
      case 4:
        return await this.handleUpdateStep4(request, response, property)
      case 5:
        return await this.handleUpdateStep5(request, response, property)
      case 6:
        return await this.handleUpdateStep6(request, response, property)
      case 7:
        return await this.handleUpdateStep7(request, response, property)
      case 8:
        return await this.handleUpdateStep8(request, response, property)
      default:
        return response.badRequest({ message: 'Étape invalide' })
    }
  }

  private async handleUpdateStep1(request: any, response: HttpContext['response'], property: Property) {
    const payload = await request.validateUsing(Step1AddressValidator)
    
    property.merge({
      address: payload.address,
      street_number: payload.street_number,
      city: payload.city,
      state: payload.state,
      postal_code: payload.postal_code,
      latitude: payload.latitude ?? property.latitude,
      longitude: payload.longitude ?? property.longitude,
      formatted_address: payload.formatted_address ?? property.formatted_address,
    })
    await property.save()

    return response.ok({
      message: 'Étape 1 mise à jour avec succès',
      data: { property, step: 1 },
    })
  }

  private async handleUpdateStep2(request: any, response: HttpContext['response'], property: Property) {
    const payload = await request.validateUsing(Step2AvailabilityValidator)
    
    let availableFrom: DateTime | undefined
    if (payload.available_from) {
      if (payload.available_from instanceof DateTime) {
        availableFrom = payload.available_from
      } else if (payload.available_from instanceof Date) {
        availableFrom = DateTime.fromJSDate(payload.available_from)
      } else if (typeof payload.available_from === 'string') {
        availableFrom = DateTime.fromISO(payload.available_from)
      } else {
        availableFrom = DateTime.fromISO(String(payload.available_from))
      }
    }

    property.merge({
      available_from: availableFrom,
      available_time: payload.available_time,
    })
    await property.save()

    return response.ok({
      message: 'Étape 2 mise à jour avec succès',
      data: { property, step: 2 },
    })
  }

  private async handleUpdateStep3(request: any, response: HttpContext['response'], property: Property) {
    const payload = await request.validateUsing(Step3RentalTimingValidator)
    
    // Note: rental_timing n'est pas encore dans le modèle, on peut l'ajouter si nécessaire
    // Pour l'instant, on ne fait rien ou on stocke dans un champ personnalisé
    await property.save()

    return response.ok({
      message: 'Étape 3 mise à jour avec succès',
      data: { property, step: 3 },
    })
  }

  private async handleUpdateStep4(request: any, response: HttpContext['response'], property: Property) {
    const payload = await request.validateUsing(Step4RentalReasonValidator)
    
    property.merge({
      rental_reason: payload.rental_reason,
      rental_reason_other: payload.rental_reason_other,
    })
    await property.save()

    return response.ok({
      message: 'Étape 4 mise à jour avec succès',
      data: { property, step: 4 },
    })
  }

  private async handleUpdateStep5(request: any, response: HttpContext['response'], property: Property) {
    const payload = await request.validateUsing(Step5DescriptionValidator)
    
    property.merge({
      description: payload.description,
    })
    await property.save()

    return response.ok({
      message: 'Étape 5 mise à jour avec succès',
      data: { property, step: 5 },
    })
  }

  private async handleUpdateStep6(request: any, response: HttpContext['response'], property: Property) {
    const payload = await request.validateUsing(Step6PropertyFactsValidator)
    
    property.merge({
      type: payload.type,
      property_use_type: payload.property_use_type,
      surface: payload.surface,
      land_size: payload.land_size,
      year_built: payload.year_built,
      rooms: payload.rooms,
      bathrooms: payload.bathrooms,
      security_deposit: payload.security_deposit,
      deposit_months: payload.deposit_months,
      price: payload.price,
      capacity: payload.rooms || property.capacity || 1,
    })
    await property.save()

    return response.ok({
      message: 'Étape 6 mise à jour avec succès',
      data: { property, step: 6 },
    })
  }

  private async handleUpdateStep7(request: any, response: HttpContext['response'], property: Property) {
    const payload = await request.validateUsing(Step7ContactValidator)
    
    property.merge({
      contact_phone: payload.contact_phone,
      additional_info: payload.additional_info,
    })
    await property.save()

    return response.ok({
      message: 'Étape 7 mise à jour avec succès',
      data: { property, step: 7 },
    })
  }

  private async handleUpdateStep8(request: any, response: HttpContext['response'], property: Property) {
    const logger = (await import('@adonisjs/core/services/logger')).default
    logger.info(`📝 [PROPERTY UPDATE STEP 8] Début - property id: ${property.id}`)

    const payload = await request.validateUsing(Step8PhotosAmenitiesValidator)
    
    logger.info(`📝 [PROPERTY UPDATE STEP 8] Validation réussie - ${payload.photos.length} photos, ${payload.amenities?.length || 0} commodités`)

    // Supprimer les anciennes photos (fichiers physiques et enregistrements DB)
    const oldPhotos = await PropertyPhoto.query().where('property_id', property.id)
    const fs = await import('node:fs/promises')
    const path = await import('node:path')
    
    for (const oldPhoto of oldPhotos) {
      try {
        // Construire le chemin complet du fichier
        let filePath: string
        if (oldPhoto.photo_url.includes('/')) {
          // Nouveau format: properties/property_<id>/img_1.jpg
          filePath = app.makePath('uploads', oldPhoto.photo_url)
        } else {
          // Ancien format: juste le nom du fichier
          filePath = app.makePath('uploads/properties', oldPhoto.photo_url)
        }
        
        // Supprimer le fichier standard s'il existe
        try {
          await fs.unlink(filePath)
          logger.info(`📝 [PROPERTY UPDATE STEP 8] Fichier supprimé: ${filePath}`)
        } catch (unlinkError: any) {
          // Ignorer si le fichier n'existe pas
          if (unlinkError.code !== 'ENOENT') {
            logger.warn(`📝 [PROPERTY UPDATE STEP 8] Erreur lors de la suppression du fichier ${filePath}: ${unlinkError.message}`)
          }
        }

        // Supprimer le thumbnail correspondant si il existe (format: thumb_1.jpg)
        try {
          const fileName = PropertyPhotoService.extractFileName(oldPhoto.photo_url)
          const thumbnailFileName = fileName.replace('img_', 'thumb_')
          const thumbnailPath = app.makePath('uploads', oldPhoto.photo_url.replace(fileName, thumbnailFileName))
          await fs.unlink(thumbnailPath).catch(() => {}) // Ignorer si le thumbnail n'existe pas
        } catch {
          // Ignorer les erreurs de suppression du thumbnail
        }
      } catch (error: any) {
        logger.warn(`📝 [PROPERTY UPDATE STEP 8] Erreur lors du traitement de la photo ${oldPhoto.id}: ${error.message}`)
      }
    }
    
    // Supprimer les enregistrements de la base de données
    await PropertyPhoto.query().where('property_id', property.id).delete()

    // S'assurer que le dossier de la propriété existe
    await PropertyPhotoService.ensurePropertyFolderExists(property.id)

    // Ajouter les nouvelles photos avec compression et optimisation
    const uploadedPhotos: PropertyPhoto[] = []
    
    try {
      for (let i = 0; i < payload.photos.length; i++) {
        const photoFile = payload.photos[i]
        
        // 1. Valider la taille du fichier
        const isValidSize = await ImageProcessingService.validateFileSize(photoFile.tmpPath!)
        if (!isValidSize) {
          throw new Error(
            `L'image ${i + 1} est trop grande. Taille maximale autorisée: 5MB`
          )
        }

        // 2. Générer les noms de fichiers (standard + thumbnail)
        const standardFileName = `img_${i + 1}.jpg`
        const thumbnailFileName = `thumb_${i + 1}.jpg`

        // 3. Chemins complets
        const tempFilePath = photoFile.tmpPath!
        const standardFilePath = PropertyPhotoService.getPhotoFullPath(property.id, standardFileName)
        const thumbnailFilePath = PropertyPhotoService.getPhotoFullPath(property.id, thumbnailFileName)

        // 4. Traiter l'image : compression + redimensionnement + suppression EXIF
        try {
          await ImageProcessingService.processImageWithThumbnail(
            tempFilePath,
            standardFilePath,
            thumbnailFilePath
          )
        } catch (processError: any) {
          logger.error(
            `[PROPERTY UPDATE STEP 8] Erreur lors du traitement de l'image ${i + 1}: ${processError.message}`
          )
          throw new Error(
            `Erreur lors du traitement de l'image ${i + 1}: ${processError.message || "Format d'image non supporté ou corrompu"}`
          )
        }

        // 5. Stocker le chemin relatif dans la base de données
        const photoRelativePath = `${PropertyPhotoService.getPropertyFolderPath(property.id)}/${standardFileName}`

        const photo = await PropertyPhoto.create({
          property_id: property.id,
          photo_url: photoRelativePath,
          display_order: i,
          is_main: i === 0,
        })

        uploadedPhotos.push(photo)

        if (i === 0) {
          property.mainPhotoUrl = photoRelativePath
        }
      }
    } catch (error: any) {
      // En cas d'erreur, nettoyer les fichiers partiellement uploadés
      logger.error(`[PROPERTY UPDATE STEP 8] Erreur lors du traitement des photos: ${error.message}`)
      
      // Supprimer les photos déjà uploadées
      for (const uploadedPhoto of uploadedPhotos) {
        try {
          await uploadedPhoto.delete()
        } catch {
          // Ignorer les erreurs de suppression
        }
      }

      return response.badRequest({
        message: error.message || 'Erreur lors du traitement des images',
        code: 'IMAGE_PROCESSING_ERROR',
      })
    }

    // Traiter les commodités
    const amenitiesList: string[] = Array.isArray(payload.amenities) ? payload.amenities : []
    if (amenitiesList.length > 0) {
      await PropertyAmenity.query().where('property_id', property.id).delete()
      for (const amenityName of amenitiesList) {
        await PropertyAmenity.create({
          property_id: property.id,
          name: amenityName,
        })
      }
    }

    await property.save()
    await property.load('photos')
    await property.load('amenities')

    return response.ok({
      message: 'Étape 8 mise à jour avec succès',
      data: property,
    })
  }

  /**
   * 📢 Publier un logement (le rendre visible publiquement).
   * Uniquement si toutes les étapes sont complétées (creation_step = 8) et au moins une photo.
   */
  async publish({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'You are not authorized' })
    if (user.activeRole !== 'landlord') {
      return response.forbidden({
        message: 'Vous devez être en mode BAILLEUR pour publier un logement.',
      })
    }

    ensureUuid(params.id, 'UUID de propriété invalide')
    const property = await Property.findBy('uuid', params.id)
    if (!property) return response.notFound({ message: 'Logement introuvable' })
    if (property.user_id !== user.id) {
      return response.forbidden({ message: "Vous n'avez pas accès à ce logement" })
    }

    if (property.creation_step !== 8) {
      return response.badRequest({
        message:
          'Complétez toutes les étapes de création (1 à 8) avant de publier votre logement.',
      })
    }

    const photoCount = await PropertyPhoto.query().where('property_id', property.id).count('* as total')
    const total = Number(photoCount[0]?.$extras?.total ?? 0)
    if (total < 1) {
      return response.badRequest({
        message: 'Ajoutez au moins une photo avant de publier votre logement.',
      })
    }

    property.isPublic = true
    await property.save()

    return response.ok({
      message: 'Logement publié avec succès. Il est maintenant visible publiquement.',
      data: property,
    })
  }

  /**
   * 📥 Dépublier un logement (le remettre en brouillon).
   */
  async unpublish({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'You are not authorized' })
    if (user.activeRole !== 'landlord') {
      return response.forbidden({
        message: 'Vous devez être en mode BAILLEUR pour gérer la publication.',
      })
    }

    ensureUuid(params.id, 'UUID de propriété invalide')
    const property = await Property.findBy('uuid', params.id)
    if (!property) return response.notFound({ message: 'Logement introuvable' })
    if (property.user_id !== user.id) {
      return response.forbidden({ message: "Vous n'avez pas accès à ce logement" })
    }

    property.isPublic = false
    await property.save()

    return response.ok({
      message: 'Logement retiré de la publication. Il est maintenant en brouillon.',
      data: property,
    })
  }

  /**
   * 🗑️ Supprimer un logement
   */
  async destroy({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'You are not authorized' })

    ensureUuid(params.id, 'UUID de propriété invalide')
    const property = await Property.findBy('uuid', params.id)
    if (!property) return response.notFound({ message: 'Logement introuvable' })
    if (property.user_id !== user.id)
      return response.forbidden({ message: "Vous n'avez pas accès à ce logement" })

    // Supprimer les photos associées (fichiers physiques et enregistrements DB)
    const photos = await PropertyPhoto.query().where('property_id', property.id)
    const fs = await import('node:fs/promises')
    
    for (const photo of photos) {
      try {
        // Construire le chemin complet du fichier
        let filePath: string
        if (photo.photo_url.includes('/')) {
          // Nouveau format: properties/property_<id>/img_1.jpg
          filePath = app.makePath('uploads', photo.photo_url)
        } else {
          // Ancien format: juste le nom du fichier
          filePath = app.makePath('uploads/properties', photo.photo_url)
        }
        
        // Supprimer le fichier s'il existe
        try {
          await fs.unlink(filePath)
        } catch (unlinkError: any) {
          // Ignorer si le fichier n'existe pas
          if (unlinkError.code !== 'ENOENT') {
            logger.warn(`Erreur lors de la suppression du fichier ${filePath}: ${unlinkError.message}`)
          }
        }
      } catch (error: any) {
        logger.warn(`Erreur lors du traitement de la photo ${photo.id}: ${error.message}`)
      }
    }
    
    // Supprimer les enregistrements de la base de données
    await PropertyPhoto.query().where('property_id', property.id).delete()
    
    // Supprimer le dossier de la propriété s'il existe (nouveau format)
    try {
      const propertyFolderPath = PropertyPhotoService.getPropertyFolderFullPath(property.id)
      await fs.rmdir(propertyFolderPath, { recursive: true })
    } catch (rmdirError: any) {
      // Ignorer si le dossier n'existe pas ou s'il n'est pas vide
      if (rmdirError.code !== 'ENOENT' && rmdirError.code !== 'ENOTEMPTY') {
        logger.warn(`Erreur lors de la suppression du dossier de la propriété: ${rmdirError.message}`)
      }
    }
    
    // Supprimer les commodités associées
    await PropertyAmenity.query().where('property_id', property.id).delete()

    // Supprimer la propriété
    await property.delete()
    
    return response.ok({ message: 'Logement supprimé avec succès' })
  }

  /**
   * 👥 Liste des locataires du bailleur connecté
   */
  async listTenants({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'You are not authorized' })

    // ISOLATION STRICTE : Seuls les utilisateurs en mode BAILLEUR peuvent voir leurs locataires
    if (user.activeRole !== 'landlord') {
      return response.forbidden({ 
        message: 'Vous devez être en mode BAILLEUR pour voir vos locataires. Changez de rôle dans votre profil.' 
      })
    }

    // 1. Récupérer les IDs de propriétés du bailleur
    const userProperties = await Property.query().where('user_id', user.id).select('id')

    const propertyIds = userProperties.map((prop) => prop.id)

    if (propertyIds.length === 0) {
      return response.ok({
        message: 'Liste des locataires récupérée (aucune propriété)',
        data: [],
      })
    }

    // 2. Récupérer les IDs de locataires à partir des contrats de ces propriétés
    const contractTenants = await Contract.query()
      .whereIn('propertyId', propertyIds)
      .select('tenantId') // Sélectionner uniquement le tenantId

    const tenantIds = contractTenants
      .map((contract) => contract.tenantId)
      // 💡 S'assurer d'avoir des IDs uniques
      .filter((value, index, self) => self.indexOf(value) === index)

    if (tenantIds.length === 0) {
      return response.ok({
        message: 'Liste des locataires récupérée (aucun contrat trouvé)',
        data: [],
      })
    }

    // 3. Récupérer les informations des locataires
    const tenants = await User.query()
      .whereIn('id', tenantIds)
      .select(['id', 'fullName', 'email', 'portable']) // 🔒 SÉLECTIONNER UNIQUEMENT LES CHAMPS PUBLICS

    return response.ok({
      message: 'Liste des locataires récupérée avec succès',
      data: tenants,
    })
  }
}
