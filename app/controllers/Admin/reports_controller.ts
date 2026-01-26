import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Property from '#models/property'
import VisitRequest from '#models/visit_request'
import Application from '#models/application'
import Review from '#models/review'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'

/**
 * Contrôleur pour les rapports admin
 * Réservé aux super_admin et admin
 */
export default class AdminReportsController {
  /**
   * Vérifie que l'utilisateur a un rôle admin ou super_admin
   */
  private async checkAdminRole(user: User): Promise<boolean> {
    await user.load('roles')
    const adminRoles = ['super_admin', 'admin']
    const userRoles = user.roles?.map((r) => r.name) || []
    return userRoles.some((role) => adminRoles.includes(role))
  }

  /**
   * Génère un rapport général
   */
  async index({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({
        status: 'error',
        message: 'Non authentifié',
      })
    }

    const isAdmin = await this.checkAdminRole(user)
    if (!isAdmin) {
      return response.forbidden({
        status: 'error',
        message: 'Accès refusé. Rôle administrateur requis.',
      })
    }

    try {
      const startDate = request.input('start_date')
        ? DateTime.fromISO(request.input('start_date'))
        : DateTime.now().startOf('month')
      const endDate = request.input('end_date')
        ? DateTime.fromISO(request.input('end_date'))
        : DateTime.now().endOf('day')

      // Statistiques générales
      const totalUsers = await User.query()
        .whereBetween('created_at', [startDate.toSQL()!, endDate.toSQL()!])
        .count('* as total')

      const totalProperties = await Property.query()
        .whereBetween('created_at', [startDate.toSQL()!, endDate.toSQL()!])
        .count('* as total')

      const totalVisits = await VisitRequest.query()
        .whereBetween('created_at', [startDate.toSQL()!, endDate.toSQL()!])
        .count('* as total')

      const totalApplications = await Application.query()
        .whereBetween('created_at', [startDate.toSQL()!, endDate.toSQL()!])
        .count('* as total')

      const totalReviews = await Review.query()
        .whereBetween('created_at', [startDate.toSQL()!, endDate.toSQL()!])
        .count('* as total')

      // Statistiques par statut
      const visitsByStatus = await VisitRequest.query()
        .whereBetween('created_at', [startDate.toSQL()!, endDate.toSQL()!])
        .groupBy('status')
        .count('* as count')
        .select('status')

      const applicationsByStatus = await Application.query()
        .whereBetween('created_at', [startDate.toSQL()!, endDate.toSQL()!])
        .groupBy('status')
        .count('* as count')
        .select('status')

      // Top propriétés (par nombre de visites)
      const topProperties = await db
        .from('visit_requests')
        .join('properties', 'visit_requests.property_id', 'properties.id')
        .whereBetween('visit_requests.created_at', [
          startDate.toSQL()!,
          endDate.toSQL()!,
        ])
        .groupBy('properties.id', 'properties.name', 'properties.uuid')
        .count('visit_requests.id as visit_count')
        .select('properties.uuid', 'properties.name')
        .orderBy('visit_count', 'desc')
        .limit(10)

      return response.ok({
        period: {
          start: startDate.toISO(),
          end: endDate.toISO(),
        },
        summary: {
          totalUsers: totalUsers[0].$extras.total,
          totalProperties: totalProperties[0].$extras.total,
          totalVisits: totalVisits[0].$extras.total,
          totalApplications: totalApplications[0].$extras.total,
          totalReviews: totalReviews[0].$extras.total,
        },
        visitsByStatus: visitsByStatus.map((v: any) => ({
          status: v.status,
          count: v.$extras.count,
        })),
        applicationsByStatus: applicationsByStatus.map((a: any) => ({
          status: a.status,
          count: a.$extras.count,
        })),
        topProperties,
      })
    } catch (error: any) {
      return response.internalServerError({
        status: 'error',
        message: 'Erreur lors de la génération du rapport',
        error: error.message,
      })
    }
  }
}
