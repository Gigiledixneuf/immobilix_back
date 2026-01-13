import type { HttpContext } from '@adonisjs/core/http'
import { ApplyToPropertyValidator } from '#validators/application'
import Property from '#models/property'
import Application, { ApplicationStatus } from '#models/application'
import Contract from '#models/contract'
import { DateTime } from 'luxon'
import NotificationsService from '#services/notifications_service'

export default class ApplicationsController {
  /**
   * GET /api/properties/:id/applications
   * Le bailleur voit les candidatures d’un logement lui appartenant
   */
  async index({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'Non authentifié' })

    // ISOLATION STRICTE : Seuls les utilisateurs en mode BAILLEUR peuvent voir les candidatures
    if (user.activeRole !== 'landlord') {
      return response.forbidden({
        message: 'Vous devez être en mode BAILLEUR pour voir les candidatures. Changez de rôle dans votre profil.',
      })
    }

    const propertyId = Number(params.id)
    const property = await Property.find(propertyId)
    if (!property) return response.notFound({ message: 'Logement introuvable' })
    if (property.user_id !== user.id) {
      return response.forbidden({ message: "Vous n'êtes pas propriétaire de ce logement" })
    }

    const apps = await Application.query()
      .where('property_id', propertyId)
      .preload('tenant', (t) => t.select(['id', 'fullName', 'email', 'portable']))

    return response.ok({ message: 'Candidatures', data: apps })
  }

  /**
   * PATCH /api/applications/:id/accept
   */
  async accept({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'Non authentifié' })

    // ISOLATION STRICTE : Seuls les utilisateurs en mode BAILLEUR peuvent accepter
    if (user.activeRole !== 'landlord') {
      return response.forbidden({
        message: 'Vous devez être en mode BAILLEUR pour accepter une candidature. Changez de rôle dans votre profil.',
      })
    }

    const application = await Application.find(params.id)
    if (!application) return response.notFound({ message: 'Candidature introuvable' })
    const property = await Property.find(application.propertyId)
    if (!property) return response.notFound({ message: 'Logement introuvable' })
    if (property.user_id !== user.id)
      return response.forbidden({ message: "Vous n'êtes pas propriétaire de ce logement" })

    application.status = ApplicationStatus.ACCEPTED
    await application.save()
    return response.ok({ message: 'Candidature acceptée', data: application })
  }

  /**
   * PATCH /api/applications/:id/reject
   */
  async reject({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'Non authentifié' })

    // ISOLATION STRICTE : Seuls les utilisateurs en mode BAILLEUR peuvent rejeter
    if (user.activeRole !== 'landlord') {
      return response.forbidden({
        message: 'Vous devez être en mode BAILLEUR pour rejeter une candidature. Changez de rôle dans votre profil.',
      })
    }

    const application = await Application.find(params.id)
    if (!application) return response.notFound({ message: 'Candidature introuvable' })
    const property = await Property.find(application.propertyId)
    if (!property) return response.notFound({ message: 'Logement introuvable' })
    if (property.user_id !== user.id)
      return response.forbidden({ message: "Vous n'êtes pas propriétaire de ce logement" })

    application.status = ApplicationStatus.REJECTED
    await application.save()
    return response.ok({ message: 'Candidature refusée', data: application })
  }

  /**
   * POST /api/applications/:id/create-contract
   * Crée un contrat minimal à partir d’une candidature (MVP)
   */
  async createContract({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'Non authentifié' })

    // ISOLATION STRICTE : Seuls les utilisateurs en mode BAILLEUR peuvent créer un contrat
    if (user.activeRole !== 'landlord') {
      return response.forbidden({
        message: 'Vous devez être en mode BAILLEUR pour créer un contrat. Changez de rôle dans votre profil.',
      })
    }

    const application = await Application.find(params.id)
    if (!application) return response.notFound({ message: 'Candidature introuvable' })
    const property = await Property.find(application.propertyId)
    if (!property) return response.notFound({ message: 'Logement introuvable' })
    if (property.user_id !== user.id)
      return response.forbidden({ message: "Vous n'êtes pas propriétaire de ce logement" })

    // Création contrat simple: actif, loyer = price, dépôt = 1 mois, currency USD
    const now = DateTime.now()
    const contract = await Contract.create({
      user_id: user.id, // ID du bailleur (propriétaire)
      propertyId: property.id,
      tenantId: application.tenantId,
      startDate: now,
      endDate: now.plus({ months: 12 }),
      description: application.message || null,
      rentAmount: property.price,
      currency: 'USD',
      status: 'active',
      depositMonths: 1,
      depositAmount: property.price,
      depositStatus: 'pending',
    })

    application.status = ApplicationStatus.ACCEPTED
    await application.save()

    return response.created({ message: 'Contrat créé à partir de la candidature', data: contract })
  }
  /**
   * POST /api/properties/:id/apply
   * Le locataire postule pour un logement.
   * ISOLATION STRICTE : Seuls les utilisateurs en mode LOCATAIRE peuvent postuler
   */
  async apply({ params, request, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'Non authentifié' })

    // ISOLATION STRICTE : Vérifier le rôle actif
    if (user.activeRole !== 'tenant') {
      return response.forbidden({
        message: 'Vous devez être en mode LOCATAIRE pour postuler à un logement. Changez de rôle dans votre profil.',
      })
    }

    const propertyId = Number(params.id)
    const property = await Property.find(propertyId)
    if (!property) return response.notFound({ message: 'Logement introuvable' })

    const payload = await request.validateUsing(ApplyToPropertyValidator)

    // Vérifier l'absence de candidature en attente existante
    const existing = await Application.query()
      .where('property_id', propertyId)
      .andWhere('tenant_id', user.id)
      .andWhere('status', ApplicationStatus.PENDING)
      .first()
    if (existing) {
      return response.badRequest({ message: 'Candidature déjà en attente pour ce logement' })
    }

    const appRow = await Application.create({
      propertyId: propertyId,
      tenantId: user.id,
      message: payload.message ?? null,
      status: ApplicationStatus.PENDING,
    })

    // Notification au bailleur propriétaire
    const notifier = new NotificationsService()
    await notifier.notifyUser(
      property.user_id,
      'Nouvelle candidature',
      `Un locataire a postulé pour votre logement #${propertyId}`,
      'application',
      {
        propertyId,
        applicationId: appRow.id,
      }
    )

    return response.created({ message: 'Candidature enregistrée', data: appRow })
  }

  /**
   * GET /api/applications/me
   * Le locataire voit ses propres candidatures
   * ISOLATION STRICTE : Seuls les utilisateurs en mode LOCATAIRE peuvent voir leurs candidatures
   */
  async myApplications({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    // ISOLATION STRICTE : Vérifier le rôle actif
    if (user.activeRole !== 'tenant') {
      return response.forbidden({
        message: 'Vous devez être en mode LOCATAIRE pour voir vos candidatures. Changez de rôle dans votre profil.',
      })
    }

    const applications = await Application.query()
      .where('tenant_id', user.id)
      .preload('property', (p) =>
        p.select(['id', 'name', 'address', 'city', 'price', 'mainPhotoUrl'])
      )
      .preload('visitRequest', (vr) => vr.select(['id', 'status', 'scheduledAt']))
      .orderBy('created_at', 'desc')

    return response.ok({
      message: 'Mes candidatures',
      data: applications,
    })
  }

  /**
   * GET /api/applications/landlord
   * Le bailleur voit toutes ses candidatures (pour toutes ses propriétés)
   * ISOLATION STRICTE : Seuls les utilisateurs en mode BAILLEUR peuvent voir leurs candidatures
   */
  async landlordApplications({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    // ISOLATION STRICTE : Vérifier le rôle actif
    if (user.activeRole !== 'landlord') {
      return response.forbidden({
        message: 'Vous devez être en mode BAILLEUR pour voir vos candidatures. Changez de rôle dans votre profil.',
      })
    }

    // Récupérer toutes les propriétés du bailleur
    const properties = await Property.query().where('user_id', user.id).select('id')
    const propertyIds = properties.map((p) => p.id)

    if (propertyIds.length === 0) {
      return response.ok({
        message: 'Mes candidatures',
        data: [],
      })
    }

    // Récupérer toutes les candidatures pour ces propriétés
    const applications = await Application.query()
      .whereIn('property_id', propertyIds)
      .preload('property', (p) =>
        p.select(['id', 'name', 'address', 'city', 'price', 'mainPhotoUrl'])
      )
      .preload('tenant', (t) => t.select(['id', 'fullName', 'email', 'portable']))
      .preload('visitRequest', (vr) => vr.select(['id', 'status', 'scheduledAt']))
      .orderBy('created_at', 'desc')

    return response.ok({
      message: 'Mes candidatures',
      data: applications,
    })
  }

  /**
   * GET /api/applications/visit-request/:visitRequestId
   * Récupérer une candidature par visit_request_id
   */
  async getByVisitRequest({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    const visitRequestId = Number(params.visitRequestId)
    const application = await Application.query()
      .where('visit_request_id', visitRequestId)
      .preload('property', (p) =>
        p.select(['id', 'name', 'address', 'city', 'price', 'mainPhotoUrl'])
      )
      .preload('visitRequest', (vr) => vr.select(['id', 'status', 'scheduledAt']))
      .first()

    if (!application) {
      return response.notFound({ message: 'Candidature introuvable pour cette visite' })
    }

    // ISOLATION STRICTE : Vérifier l'accès selon le rôle actif
    if (!user.activeRole) {
      return response.forbidden({
        message: 'Aucun rôle actif défini. Veuillez sélectionner un rôle dans votre profil.',
      })
    }

    const property = await Property.find(application.propertyId)
    if (!property) {
      return response.notFound({ message: 'Logement introuvable' })
    }

    let hasAccess = false

    if (user.activeRole === 'tenant') {
      hasAccess = application.tenantId === user.id
    } else if (user.activeRole === 'landlord') {
      hasAccess = property.user_id === user.id
    }

    if (!hasAccess) {
      return response.forbidden({ message: "Vous n'êtes pas autorisé à voir cette candidature" })
    }

    return response.ok({
      message: 'Candidature',
      data: application,
    })
  }
}



