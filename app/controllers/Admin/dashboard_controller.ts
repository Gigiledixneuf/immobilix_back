import type { HttpContext } from '@adonisjs/core/http'
import User from '#models/user'
import Property from '#models/property'
import VisitRequest from '#models/visit_request'
import Review from '#models/review'
import Application from '#models/application'
import { DateTime } from 'luxon'
import db from '@adonisjs/lucid/services/db'

/**
 * Contrôleur pour le dashboard admin
 * Fournit les statistiques KPI pour l'interface d'administration
 */
export default class AdminDashboardController {
  /**
   * Vérifie que l'utilisateur a un rôle admin
   */
  private async checkAdminRole(user: User): Promise<boolean> {
    await user.load('roles')
    const adminRoles = ['super_admin', 'admin', 'moderator']
    const userRoles = user.roles?.map((r) => r.name) || []
    return userRoles.some((role) => adminRoles.includes(role))
  }

  /**
   * Récupère les statistiques du dashboard
   */
  async index({ auth, response }: HttpContext) {
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
      // Statistiques des utilisateurs
      const totalUsers = await User.query().count('* as total')
      const usersThisMonth = await User.query()
        .where('created_at', '>=', DateTime.now().startOf('month').toSQL())
        .count('* as total')

      const previousMonthUsers = await User.query()
        .whereBetween('created_at', [
          DateTime.now().minus({ months: 2 }).startOf('month').toSQL()!,
          DateTime.now().minus({ months: 1 }).startOf('month').toSQL()!,
        ])
        .count('* as total')

      const usersChange =
        previousMonthUsers[0].$extras.total > 0
          ? ((usersThisMonth[0].$extras.total - previousMonthUsers[0].$extras.total) /
              previousMonthUsers[0].$extras.total) *
            100
          : 0

      // Statistiques des propriétés
      const totalProperties = await Property.query().count('* as total')
      // Note: Le modèle Property n'a pas de colonne is_active
      // On considère toutes les propriétés comme actives pour l'instant
      const activePropertiesCount = totalProperties[0].$extras.total

      const propertiesThisMonth = await Property.query()
        .where('created_at', '>=', DateTime.now().startOf('month').toSQL())
        .count('* as total')

      const previousMonthProperties = await Property.query()
        .whereBetween('created_at', [
          DateTime.now().minus({ months: 2 }).startOf('month').toSQL()!,
          DateTime.now().minus({ months: 1 }).startOf('month').toSQL()!,
        ])
        .count('* as total')

      const propertiesChange =
        previousMonthProperties[0].$extras.total > 0
          ? ((propertiesThisMonth[0].$extras.total - previousMonthProperties[0].$extras.total) /
              previousMonthProperties[0].$extras.total) *
            100
          : 0

      // Statistiques des visites
      const totalVisits = await VisitRequest.query().count('* as total')
      const visitsThisMonth = await VisitRequest.query()
        .where('created_at', '>=', DateTime.now().startOf('month').toSQL())
        .count('* as total')

      const previousMonthVisits = await VisitRequest.query()
        .whereBetween('created_at', [
          DateTime.now().minus({ months: 2 }).startOf('month').toSQL()!,
          DateTime.now().minus({ months: 1 }).startOf('month').toSQL()!,
        ])
        .count('* as total')

      const visitsChange =
        previousMonthVisits[0].$extras.total > 0
          ? ((visitsThisMonth[0].$extras.total - previousMonthVisits[0].$extras.total) /
              previousMonthVisits[0].$extras.total) *
            100
          : 0

      // Statistiques des applications
      const totalApplications = await Application.query().count('* as total')
      const pendingApplications = await Application.query()
        .where('status', 'pending')
        .count('* as total')

      // Statistiques des avis
      const totalReviews = await Review.query().count('* as total')
      const averageRating = await Review.query()
        .avg('rating as avg')
        .first()

      // Données pour les graphiques (7 derniers jours)
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = DateTime.now().minus({ days: 6 - i }).startOf('day')
        return date.toSQL()!
      })

      // Utilisateurs créés par jour (7 derniers jours)
      const usersByDay = await Promise.all(
        last7Days.map(async (dayStart) => {
          const dayEnd = DateTime.fromSQL(dayStart).endOf('day').toSQL()!
          const count = await User.query()
            .whereBetween('created_at', [dayStart, dayEnd])
            .count('* as total')
          return {
            date: DateTime.fromSQL(dayStart).toFormat('EEE'), // Format: Lun, Mar, etc.
            count: count[0].$extras.total,
          }
        })
      )

      // Propriétés créées par jour (7 derniers jours)
      const propertiesByDay = await Promise.all(
        last7Days.map(async (dayStart) => {
          const dayEnd = DateTime.fromSQL(dayStart).endOf('day').toSQL()!
          const count = await Property.query()
            .whereBetween('created_at', [dayStart, dayEnd])
            .count('* as total')
          return {
            date: DateTime.fromSQL(dayStart).toFormat('EEE'), // Format: Lun, Mar, etc.
            count: count[0].$extras.total,
          }
        })
      )

      // Visites par statut
      const visitsByStatus = await VisitRequest.query()
        .select('status')
        .count('* as count')
        .groupBy('status')

      // Applications par statut
      const applicationsByStatus = await Application.query()
        .select('status')
        .count('* as count')
        .groupBy('status')

      // Retourner les KPI
      return response.ok({
        kpi: [
          {
            title: 'UTILISATEURS TOTAUX',
            value: totalUsers[0].$extras.total.toString(),
            change: {
              value: Math.abs(usersChange).toFixed(1),
              isPositive: usersChange >= 0,
            },
            icon: 'people',
            color: 'primary',
          },
          {
            title: 'PROPRIÉTÉS ACTIVES',
            value: activePropertiesCount.toString(),
            change: {
              value: Math.abs(propertiesChange).toFixed(1),
              isPositive: propertiesChange >= 0,
            },
            icon: 'home',
            color: 'success',
          },
          {
            title: 'VISITES CE MOIS',
            value: visitsThisMonth[0].$extras.total.toString(),
            change: {
              value: Math.abs(visitsChange).toFixed(1),
              isPositive: visitsChange >= 0,
            },
            icon: 'event',
            color: 'warning',
          },
          {
            title: 'CANDIDATURES EN ATTENTE',
            value: pendingApplications[0].$extras.total.toString(),
            icon: 'description',
            color: 'primary',
          },
        ],
        stats: {
          totalUsers: totalUsers[0].$extras.total,
          totalProperties: totalProperties[0].$extras.total,
          activeProperties: activePropertiesCount,
          totalVisits: totalVisits[0].$extras.total,
          totalApplications: totalApplications[0].$extras.total,
          pendingApplications: pendingApplications[0].$extras.total,
          totalReviews: totalReviews[0].$extras.total,
          averageRating: averageRating?.$extras.avg
            ? parseFloat(averageRating.$extras.avg).toFixed(1)
            : '0.0',
        },
        charts: {
          activity: {
            labels: usersByDay.map((d) => d.date),
            users: usersByDay.map((d) => d.count),
            properties: propertiesByDay.map((d) => d.count),
          },
          visitsByStatus: visitsByStatus.map((v) => ({
            status: v.status,
            count: v.$extras.count,
          })),
          applicationsByStatus: applicationsByStatus.map((a) => ({
            status: a.status,
            count: a.$extras.count,
          })),
        },
      })
    } catch (error: any) {
      return response.internalServerError({
        status: 'error',
        message: 'Erreur lors de la récupération des statistiques',
        error: error.message,
      })
    }
  }

  /**
   * Recherche globale dans tous les modules admin
   */
  async globalSearch({ auth, request, response }: HttpContext) {
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
      const query = request.input('q', '').trim()

      if (!query || query.length < 2) {
        return response.ok({
          status: 'success',
          data: {
            users: [],
            properties: [],
            visits: [],
            applications: [],
            reviews: [],
          },
        })
      }

      const searchTerm = `%${query}%`

      // Recherche dans les utilisateurs
      const users = await User.query()
        .where((q) => {
          q.where('email', 'like', searchTerm)
            .orWhere('first_name', 'like', searchTerm)
            .orWhere('last_name', 'like', searchTerm)
            .orWhere('full_name', 'like', searchTerm)
        })
        .limit(5)
        .select('uuid', 'email', 'first_name', 'last_name', 'full_name', 'created_at')

      // Recherche dans les propriétés
      const properties = await Property.query()
        .where((q) => {
          q.where('name', 'like', searchTerm)
            .orWhere('address', 'like', searchTerm)
            .orWhere('city', 'like', searchTerm)
            .orWhere('description', 'like', searchTerm)
        })
        .limit(5)
        .select('uuid', 'name', 'address', 'city', 'created_at')

      // Recherche dans les visites
      const visits = await VisitRequest.query()
        .preload('property', (propertyQuery) => {
          propertyQuery.select('uuid', 'name', 'address')
        })
        .preload('tenant', (tenantQuery) => {
          tenantQuery.select('uuid', 'first_name', 'last_name', 'full_name', 'email')
        })
        .where((q) => {
          q.where('status', 'like', searchTerm)
            .orWhere('message', 'like', searchTerm)
        })
        .limit(5)
        .select('uuid', 'status', 'requested_date', 'property_id', 'tenant_id', 'created_at')

      // Recherche dans les applications
      const applications = await Application.query()
        .preload('property', (propertyQuery) => {
          propertyQuery.select('uuid', 'name', 'address')
        })
        .preload('tenant', (tenantQuery) => {
          tenantQuery.select('uuid', 'first_name', 'last_name', 'full_name', 'email')
        })
        .where((q) => {
          q.where('status', 'like', searchTerm)
            .orWhere('message', 'like', searchTerm)
        })
        .limit(5)
        .select('uuid', 'status', 'property_id', 'tenant_id', 'created_at')

      // Recherche dans les avis
      const reviews = await Review.query()
        .preload('property', (propertyQuery) => {
          propertyQuery.select('uuid', 'name', 'address')
        })
        .preload('user', (userQuery) => {
          userQuery.select('uuid', 'first_name', 'last_name', 'full_name', 'email')
        })
        .where((q) => {
          q.where('comment', 'like', searchTerm)
        })
        .limit(5)
        .select('uuid', 'rating', 'comment', 'property_id', 'user_id', 'created_at')

      return response.ok({
        status: 'success',
        data: {
          users: users.map((u) => ({
            id: u.uuid,
            type: 'user',
            title: u.fullName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
            subtitle: u.email,
            url: `/admin/users/${u.uuid}`,
            createdAt: u.createdAt,
          })),
          properties: properties.map((p) => ({
            id: p.uuid,
            type: 'property',
            title: p.name,
            subtitle: `${p.address}, ${p.city}`,
            url: `/admin/properties/${p.uuid}`,
            createdAt: p.createdAt,
          })),
          visits: visits.map((v) => ({
            id: v.uuid,
            type: 'visit',
            title: `Visite - ${v.property?.name || 'N/A'}`,
            subtitle: `Statut: ${v.status}`,
            url: `/admin/visits/${v.uuid}`,
            createdAt: v.createdAt,
          })),
          applications: applications.map((a) => ({
            id: a.uuid,
            type: 'application',
            title: `Candidature - ${a.property?.name || 'N/A'}`,
            subtitle: `Statut: ${a.status}`,
            url: `/admin/applications/${a.uuid}`,
            createdAt: a.createdAt,
          })),
          reviews: reviews.map((r) => ({
            id: r.uuid,
            type: 'review',
            title: `Avis - ${r.property?.name || 'N/A'}`,
            subtitle: `Note: ${r.rating}/5`,
            url: `/admin/reviews/${r.uuid}`,
            createdAt: r.createdAt,
          })),
        },
      })
    } catch (error: any) {
      return response.internalServerError({
        status: 'error',
        message: 'Erreur lors de la recherche globale',
        error: error.message,
      })
    }
  }
}
