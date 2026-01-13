import type { HttpContext } from '@adonisjs/core/http'
import LandlordAvailabilityService from '#services/landlord_availability_service'
import { CreateLandlordAvailabilityValidator } from '#validators/landlord_availability'

/**
 * Contrôleur pour la gestion des disponibilités du bailleur
 * 
 * Permet au bailleur de configurer ses jours et heures de disponibilité
 * pour recevoir des visites de ses propriétés.
 */
export default class LandlordAvailabilitiesController {
  private availabilityService: LandlordAvailabilityService

  constructor() {
    this.availabilityService = new LandlordAvailabilityService()
  }

  /**
   * GET /api/landlord/availabilities
   * Récupère la disponibilité active du bailleur connecté
   */
  async index({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    // ISOLATION STRICTE : Seuls les utilisateurs en mode BAILLEUR peuvent voir leurs disponibilités
    if (user.activeRole !== 'landlord') {
      return response.forbidden({
        message: 'Vous devez être en mode BAILLEUR pour voir vos disponibilités. Changez de rôle dans votre profil.',
      })
    }

    const availability = await this.availabilityService.getActiveAvailability(user.id)

    return response.ok({
      status: 'success',
      message: 'Disponibilité récupérée',
      data: availability,
    })
  }

  /**
   * POST /api/landlord/availabilities
   * Crée ou met à jour la disponibilité du bailleur connecté
   */
  async store({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    // ISOLATION STRICTE : Seuls les utilisateurs en mode BAILLEUR peuvent configurer leurs disponibilités
    if (user.activeRole !== 'landlord') {
      return response.forbidden({
        message: 'Vous devez être en mode BAILLEUR pour configurer vos disponibilités. Changez de rôle dans votre profil.',
      })
    }

    const payload = await request.validateUsing(CreateLandlordAvailabilityValidator)

    try {
      const availability = await this.availabilityService.createOrUpdateAvailability(
        user.id,
        payload.available_days,
        payload.start_time,
        payload.end_time,
        payload.visit_duration_minutes || 30
      )

      // Générer automatiquement les créneaux pour les 30 prochains jours
      // (en arrière-plan, ne pas bloquer la réponse)
      setImmediate(async () => {
        try {
          await this.availabilityService.generateSlotsForAllProperties(user.id, 30)
        } catch (error: any) {
          const logger = await import('@adonisjs/core/services/logger')
          logger.default.error('Error generating slots after availability update:', error)
        }
      })

      return response.created({
        status: 'success',
        message: 'Disponibilité configurée avec succès',
        data: availability,
      })
    } catch (error: any) {
      return response.internalServerError({
        status: 'error',
        message: 'Erreur lors de la configuration de la disponibilité',
        error: error.message,
      })
    }
  }
}


