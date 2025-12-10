import type { HttpContext } from '@adonisjs/core/http'
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
import PropertyPhoto from '#models/property_photo'
import PropertyAmenity from '#models/property_amenity'
import app from '@adonisjs/core/services/app'
import Contract from '#models/contract'
import User from '#models/user'
import { DateTime } from 'luxon'

export default class PropertiesController {
  /**
   * 🏠 Liste des logements du bailleur connecté
   */
  async index({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'You are not authorized' })

    await user.load('roles')
    const isBailleur = user.roles?.some((r) => r.name === 'bailleur') ?? false
    if (!isBailleur) return response.badRequest({ message: "Vous n'êtes pas bailleur" })

    // Ne récupérer que les propriétés complètes (création terminée)
    const properties = await Property.query()
      .where('user_id', user.id)
      .where('creation_step', '>=', 8) // Seulement les propriétés complètes
      .preload('photos')
      .preload('amenities')
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

    await user.load('roles')
    const isBailleur = user.roles?.some((role) => role.name === 'bailleur') ?? false
    if (!isBailleur) {
      logger.warn(`📝 [PROPERTY STORE] Utilisateur ${user.id} n'est pas bailleur`)
      return response.badRequest({ message: "Vous n'êtes pas bailleur" })
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

    // Traiter les photos
    const photoFiles = payload.photos
    const uploadedPhotos: PropertyPhoto[] = []

    for (let i = 0; i < photoFiles.length; i++) {
      const photoFile = photoFiles[i]
      await photoFile.move(app.makePath('uploads/properties'))
      const fileName = photoFile.fileName

      const photo = await PropertyPhoto.create({
        property_id: property.id,
        photo_url: fileName,
        display_order: i,
        is_main: i === 0, // La première photo est la photo principale
      })

      uploadedPhotos.push(photo)

      // Mettre à jour mainPhotoUrl si c'est la première photo
      if (i === 0) {
        property.mainPhotoUrl = fileName
      }
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

    // Traiter les photos
    const photoFiles = payload.photos
    for (let i = 0; i < photoFiles.length; i++) {
      const photoFile = photoFiles[i]
      await photoFile.move(app.makePath('uploads/properties'))
      const fileName = photoFile.fileName

      await PropertyPhoto.create({
        property_id: property.id,
        photo_url: fileName,
        display_order: i,
        is_main: i === 0,
      })

      if (i === 0) {
        property.mainPhotoUrl = fileName
        await property.save()
      }
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

    const isOwner = user.id === property.user_id

    // On vérifie s'il existe un contrat entre l'utilisateur et le logement
    const contract = await Contract.query()
      .where('property_id', property.id)
      .where('tenant_id', user.id)
      .first()
    const isTenant = !!contract

    if (!isOwner && !isTenant) {
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
    }

    // La réponse inclut maintenant les données du logement et celles du bailleur
    return response.ok({ message: 'Détails du logement', data: propertyData })
  }

  /**
   * ✏️ Modifier un logement
   */
  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'You are not authorized' })

    const property = await Property.find(params.id)
    if (!property) return response.notFound({ message: 'Logement introuvable' })
    if (property.user_id !== user.id)
      return response.forbidden({ message: "Vous n'avez pas accès à ce logement" })

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
      surface: property.surface ?? property.surface,
      rooms: property.rooms ?? property.rooms,
      capacity: property.capacity ?? property.capacity,
      price: property.price ?? property.price,
      description: property.description ?? property.description,
      mainPhotoUrl: fileName ?? property.mainPhotoUrl,
    })

    await property.save()

    return response.ok({
      message: 'Logement mis à jour avec succès',
      data: property,
    })
  }

  /**
   * 🗑️ Supprimer un logement
   */
  async destroy({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'You are not authorized' })

    const property = await Property.find(params.id)
    if (!property) return response.notFound({ message: 'Logement introuvable' })
    if (property.user_id !== user.id)
      return response.forbidden({ message: "Vous n'avez pas accès à ce logement" })

    await property.delete()
    return response.ok({ message: 'Logement supprimé avec succès' })
  }

  /**
   * 👥 Liste des locataires du bailleur connecté
   */
  async listTenants({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'You are not authorized' })

    await user.load('roles')
    const isBailleur = user.roles?.some((r) => r.name === 'bailleur') ?? false
    if (!isBailleur)
      return response.forbidden({ message: "Vous n'êtes pas autorisé à accéder à cette liste" })

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
