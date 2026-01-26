import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import Property from '#models/property'
import Contract from '#models/contract'
import User from '#models/user'

export default class DashboardController {
  /**
   * GET /api/dashboard
   * Récupère les statistiques du dashboard pour le bailleur
   * ISOLATION STRICTE : Seuls les utilisateurs en mode BAILLEUR peuvent accéder
   */
  async index({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'You are not authorized' })

    // ISOLATION STRICTE : Vérifier le rôle actif
    if (user.activeRole !== 'landlord') {
      return response.forbidden({ 
        message: 'Vous devez être en mode BAILLEUR pour accéder au dashboard. Changez de rôle dans votre profil.' 
      })
    }

    try {
      // 1. Statistiques générales
      const totalProperties = await Property.query().where('user_id', user.id).count('* as total')
      const totalPropertiesCount = Number(totalProperties[0].$extras.total)

      // 2. Contrats actifs
      const userProperties = await Property.query().where('user_id', user.id).select('id')
      const propertyIds = userProperties.map((prop) => prop.id)

      const activeContracts = propertyIds.length > 0
        ? await Contract.query()
            .whereIn('propertyId', propertyIds)
            .where('status', 'active')
            .count('* as total')
        : [{ $extras: { total: 0 } }]
      const activeContractsCount = Number(activeContracts[0].$extras.total)

      // 3. Locataires uniques
      const tenantIds =
        propertyIds.length > 0
          ? await Contract.query()
              .whereIn('propertyId', propertyIds)
              .select('tenantId')
              .distinct()
          : []
      const totalTenants = tenantIds.length

      // 4. Propriétés récentes (5 dernières)
      const recentProperties = await Property.query()
        .where('user_id', user.id)
        .orderBy('created_at', 'desc')
        .limit(5)

      // 5. Contrats récents (5 derniers)
      let recentContracts: any[] = []
      if (propertyIds.length > 0) {
        recentContracts = await Contract.query()
          .whereIn('propertyId', propertyIds)
          .preload('property')
          .preload('tenant')
          .orderBy('created_at', 'desc')
          .limit(5)
      }

      return response.ok({
        message: 'Dashboard récupéré avec succès',
        data: {
          statistics: {
            totalProperties: totalPropertiesCount,
            activeContracts: activeContractsCount,
            totalTenants: totalTenants,
          },
          recentProperties: recentProperties,
          recentContracts: recentContracts,
        },
      })
    } catch (error) {
      logger.error('Error in DashboardController.index:', error)
      return response.internalServerError({
        message: 'Erreur lors de la récupération du dashboard',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
}
