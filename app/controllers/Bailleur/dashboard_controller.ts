import type { HttpContext } from '@adonisjs/core/http'
import Property from '#models/property'
import Contract from '#models/contract'
import Invoice from '#models/invoice'
import Payment from '#models/payment'
import User from '#models/user'
import db from '@adonisjs/lucid/services/db'

export default class DashboardController {
  /**
   * GET /api/dashboard
   * Récupère les statistiques du dashboard pour le bailleur
   */
  async index({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'You are not authorized' })

    await user.load('roles')
    const isBailleur = user.roles?.some((r) => r.name === 'bailleur') ?? false
    if (!isBailleur) {
      return response.forbidden({ message: "Vous n'êtes pas autorisé à accéder au dashboard" })
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

      // 4. Revenus (paiements payés)
      let totalRevenueAmount = 0
      let monthlyRevenueAmount = 0
      let pendingInvoicesCount = 0
      let pendingInvoicesAmountTotal = 0

      if (propertyIds.length > 0) {
        const userContracts = await Contract.query().whereIn('propertyId', propertyIds).select('id')
        const contractIds = userContracts.map((c) => c.id)

        if (contractIds.length > 0) {
          // Revenus totaux
          const totalRevenue = await db
            .from('payments')
            .whereIn('contract_id', contractIds)
            .where('status', 'paid')
            .sum('amount as total')
            .first()
          totalRevenueAmount = Number(totalRevenue?.total || 0)

          // Revenus du mois en cours
          const currentMonth = new Date()
          const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1)
          const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)

          const monthlyRevenue = await db
            .from('payments')
            .whereIn('contract_id', contractIds)
            .where('status', 'paid')
            .whereBetween('created_at', [startOfMonth, endOfMonth])
            .sum('amount as total')
            .first()
          monthlyRevenueAmount = Number(monthlyRevenue?.total || 0)

          // Factures en attente
          const pendingInvoices = await db
            .from('invoices')
            .whereIn('contract_id', contractIds)
            .where('status', 'pending')
            .count('* as total')
            .first()
          pendingInvoicesCount = Number(pendingInvoices?.total || 0)

          // Montant total des factures en attente
          const pendingInvoicesAmount = await db
            .from('invoices')
            .whereIn('contract_id', contractIds)
            .where('status', 'pending')
            .sum('amount as total')
            .first()
          pendingInvoicesAmountTotal = Number(pendingInvoicesAmount?.total || 0)
        }
      }

      // 8. Propriétés récentes (5 dernières)
      const recentProperties = await Property.query()
        .where('user_id', user.id)
        .orderBy('created_at', 'desc')
        .limit(5)

      // 9. Contrats récents (5 derniers)
      let recentContracts: any[] = []
      if (propertyIds.length > 0) {
        recentContracts = await Contract.query()
          .whereIn('propertyId', propertyIds)
          .preload('property')
          .preload('tenant')
          .orderBy('created_at', 'desc')
          .limit(5)
      }

      // 10. Paiements récents (10 derniers)
      let recentPayments: any[] = []
      if (propertyIds.length > 0) {
        const userContracts = await Contract.query().whereIn('propertyId', propertyIds).select('id')
        const contractIds = userContracts.map((c) => c.id)
        if (contractIds.length > 0) {
          recentPayments = await Payment.query()
            .whereIn('contractId', contractIds)
            .preload('contract', (query) => {
              query.preload('property').preload('tenant')
            })
            .orderBy('created_at', 'desc')
            .limit(10)
        }
      }

      // 11. Factures récentes (10 dernières)
      let recentInvoices: any[] = []
      if (propertyIds.length > 0) {
        const userContracts = await Contract.query().whereIn('propertyId', propertyIds).select('id')
        const contractIds = userContracts.map((c) => c.id)
        if (contractIds.length > 0) {
          recentInvoices = await Invoice.query()
            .whereIn('contractId', contractIds)
            .preload('contract', (query) => {
              query.preload('property').preload('tenant')
            })
            .preload('tenant')
            .orderBy('created_at', 'desc')
            .limit(10)
        }
      }

      return response.ok({
        message: 'Dashboard récupéré avec succès',
        data: {
          statistics: {
            totalProperties: totalPropertiesCount,
            activeContracts: activeContractsCount,
            totalTenants: totalTenants,
            totalRevenue: totalRevenueAmount,
            monthlyRevenue: monthlyRevenueAmount,
            pendingInvoices: pendingInvoicesCount,
            pendingInvoicesAmount: pendingInvoicesAmountTotal,
          },
          recentProperties: recentProperties,
          recentContracts: recentContracts,
          recentPayments: recentPayments,
          recentInvoices: recentInvoices,
        },
      })
    } catch (error) {
      console.error('Error in DashboardController.index:', error)
      return response.internalServerError({
        message: 'Erreur lors de la récupération du dashboard',
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }
}

