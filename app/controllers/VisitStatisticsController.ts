import type { HttpContext } from '@adonisjs/core/http'
import VisitStatisticsService from '#services/visit_statistics_service'
import Property from '#models/property'

/**
 * Contrôleur pour les statistiques de visites
 */
export default class VisitStatisticsController {
  private statisticsService: VisitStatisticsService

  constructor() {
    this.statisticsService = new VisitStatisticsService()
  }

  /**
   * GET /api/landlord/visit-statistics
   * Statistiques globales pour le bailleur connecté
   */
  async getLandlordStatistics({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    // ISOLATION STRICTE : Seuls les utilisateurs en mode BAILLEUR peuvent voir leurs statistiques
    if (user.activeRole !== 'landlord') {
      return response.forbidden({
        message: 'Vous devez être en mode BAILLEUR pour voir vos statistiques. Changez de rôle dans votre profil.',
      })
    }

    try {
      const statistics = await this.statisticsService.getLandlordStatistics(user.id)

      return response.ok({
        status: 'success',
        message: 'Statistiques récupérées',
        data: statistics,
      })
    } catch (error: any) {
      return response.internalServerError({
        status: 'error',
        message: 'Erreur lors du calcul des statistiques',
        error: error.message,
      })
    }
  }

  /**
   * GET /api/properties/:id/visit-statistics
   * Statistiques pour une propriété spécifique
   */
  async getPropertyStatistics({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    const propertyId = Number(params.id)
    const property = await Property.find(propertyId)

    if (!property) {
      return response.notFound({ message: 'Propriété introuvable' })
    }

    // ISOLATION STRICTE : Vérifier le rôle actif et l'ownership
    if (user.activeRole !== 'landlord') {
      return response.forbidden({
        message: 'Vous devez être en mode BAILLEUR pour voir les statistiques. Changez de rôle dans votre profil.',
      })
    }

    if (property.user_id !== user.id) {
      return response.forbidden({ message: "Vous n'êtes pas propriétaire de cette propriété" })
    }

    try {
      const statistics = await this.statisticsService.getPropertyStatistics(propertyId, user.id)

      return response.ok({
        status: 'success',
        message: 'Statistiques récupérées',
        data: statistics,
      })
    } catch (error: any) {
      return response.internalServerError({
        status: 'error',
        message: 'Erreur lors du calcul des statistiques',
        error: error.message,
      })
    }
  }
}
