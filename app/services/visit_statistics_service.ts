import Property from '#models/property'
import VisitRequest, { VisitRequestStatus } from '#models/visit_request'
import Application from '#models/application'
import Contract from '#models/contract'
import { DateTime } from 'luxon'
import logger from '@adonisjs/core/services/logger'

/**
 * Service de statistiques pour les visites
 * 
 * Fournit des statistiques complètes sur :
 * - Les demandes de visite par statut
 * - Les taux de conversion (visite → candidature → contrat)
 * - Les no-show et auto-cancellations
 * - Les temps moyens entre étapes
 */
export default class VisitStatisticsService {
  /**
   * Statistiques globales pour un bailleur
   */
  async getLandlordStatistics(landlordId: number) {
    try {
      const properties = await Property.query().where('user_id', landlordId).select('id')
      const propertyIds = properties.map((p) => p.id)

      if (propertyIds.length === 0) {
        return this.getEmptyStatistics()
      }

      // Récupérer toutes les demandes de visite pour ces propriétés
      const allVisits = await VisitRequest.query().whereIn('property_id', propertyIds)

      // Compter par statut
      const byStatus = this.countByStatus(allVisits)

      // Visites complétées
      const completedVisits = allVisits.filter(
        (v) => v.status === VisitRequestStatus.COMPLETED
      )

      // Visites avec candidatures
      const visitsWithApplications = await Application.query()
        .whereIn('property_id', propertyIds)
        .whereNotNull('visit_request_id')
        .whereIn(
          'visit_request_id',
          completedVisits.map((v) => v.id)
        )

      // Visites avec contrats
      const visitsWithContracts = await Contract.query()
        .whereIn('property_id', propertyIds)
        .whereNotNull('visit_request_id')
        .whereIn(
          'visit_request_id',
          completedVisits.map((v) => v.id)
        )

      // Calculer les taux de conversion
      const completedCount = completedVisits.length
      const applicationsCount = visitsWithApplications.length
      const contractsCount = visitsWithContracts.length

      const conversionRates = {
        visit_to_application:
          completedCount > 0 ? ((applicationsCount / completedCount) * 100).toFixed(2) : '0.00',
        visit_to_contract:
          completedCount > 0 ? ((contractsCount / completedCount) * 100).toFixed(2) : '0.00',
        application_to_contract:
          applicationsCount > 0
            ? ((contractsCount / applicationsCount) * 100).toFixed(2)
            : '0.00',
      }

      // Temps moyens entre étapes
      const averageTimes = await this.calculateAverageTimes(propertyIds)

      // No-show et auto-cancellations
      const noShowCount = allVisits.filter((v) => v.status === VisitRequestStatus.NO_SHOW).length
      const autoCancelledCount = allVisits.filter(
        (v) => v.status === VisitRequestStatus.AUTO_CANCELLED
      ).length

      return {
        total_requests: allVisits.length,
        by_status: byStatus,
        completed_visits: completedCount,
        visits_with_applications: applicationsCount,
        visits_with_contracts: contractsCount,
        no_show_count: noShowCount,
        auto_cancelled_count: autoCancelledCount,
        conversion_rates: conversionRates,
        average_times: averageTimes,
      }
    } catch (error: any) {
      logger.error('Error calculating landlord statistics:', error)
      throw error
    }
  }

  /**
   * Statistiques pour une propriété spécifique
   */
  async getPropertyStatistics(propertyId: number, landlordId: number) {
    try {
      // Vérifier que la propriété appartient au bailleur
      const property = await Property.find(propertyId)
      if (!property || property.user_id !== landlordId) {
        throw new Error('Propriété introuvable ou non autorisée')
      }

      const allVisits = await VisitRequest.query().where('property_id', propertyId)

      const byStatus = this.countByStatus(allVisits)

      const completedVisits = allVisits.filter(
        (v) => v.status === VisitRequestStatus.COMPLETED
      )

      const visitsWithApplications = await Application.query()
        .where('property_id', propertyId)
        .whereNotNull('visit_request_id')
        .whereIn(
          'visit_request_id',
          completedVisits.map((v) => v.id)
        )

      const visitsWithContracts = await Contract.query()
        .where('property_id', propertyId)
        .whereNotNull('visit_request_id')
        .whereIn(
          'visit_request_id',
          completedVisits.map((v) => v.id)
        )

      const completedCount = completedVisits.length
      const applicationsCount = visitsWithApplications.length
      const contractsCount = visitsWithContracts.length

      const conversionRates = {
        visit_to_application:
          completedCount > 0 ? ((applicationsCount / completedCount) * 100).toFixed(2) : '0.00',
        visit_to_contract:
          completedCount > 0 ? ((contractsCount / completedCount) * 100).toFixed(2) : '0.00',
      }

      const averageTimes = await this.calculateAverageTimes([propertyId])

      const noShowCount = allVisits.filter((v) => v.status === VisitRequestStatus.NO_SHOW).length
      const autoCancelledCount = allVisits.filter(
        (v) => v.status === VisitRequestStatus.AUTO_CANCELLED
      ).length

      return {
        property_id: propertyId,
        total_requests: allVisits.length,
        by_status: byStatus,
        completed_visits: completedCount,
        visits_with_applications: applicationsCount,
        visits_with_contracts: contractsCount,
        no_show_count: noShowCount,
        auto_cancelled_count: autoCancelledCount,
        conversion_rates: conversionRates,
        average_times: averageTimes,
      }
    } catch (error: any) {
      logger.error('Error calculating property statistics:', error)
      throw error
    }
  }

  /**
   * Compte les visites par statut
   */
  private countByStatus(visits: VisitRequest[]): Array<{ status: string; count: number }> {
    const statusCounts: Record<string, number> = {}

    visits.forEach((visit) => {
      statusCounts[visit.status] = (statusCounts[visit.status] || 0) + 1
    })

    return Object.entries(statusCounts).map(([status, count]) => ({
      status,
      count,
    }))
  }

  /**
   * Calcule les temps moyens entre étapes
   */
  private async calculateAverageTimes(propertyIds: number[]) {
    const completedVisits = await VisitRequest.query()
      .whereIn('property_id', propertyIds)
      .where('status', VisitRequestStatus.COMPLETED)
      .whereNotNull('scheduled_at')
      .whereNotNull('completed_at')

    if (completedVisits.length === 0) {
      return {
        request_to_acceptance: null,
        acceptance_to_completion: null,
        completion_to_application: null,
        completion_to_contract: null,
      }
    }

    // Temps moyen : demande → acceptation
    const requestToAcceptance: number[] = []
    completedVisits.forEach((visit) => {
      if (visit.scheduledAt && visit.createdAt) {
        const diff = DateTime.fromJSDate(visit.scheduledAt).diff(
          DateTime.fromJSDate(visit.createdAt.toJSDate()),
          'hours'
        )
        requestToAcceptance.push(diff.hours)
      }
    })

    // Temps moyen : acceptation → complétion
    const acceptanceToCompletion: number[] = []
    completedVisits.forEach((visit) => {
      if (visit.scheduledAt && visit.completedAt) {
        const diff = DateTime.fromJSDate(visit.completedAt!).diff(
          DateTime.fromJSDate(visit.scheduledAt),
          'hours'
        )
        acceptanceToCompletion.push(diff.hours)
      }
    })

    // Temps moyen : complétion → candidature
    const completionToApplication: number[] = []
    for (const visit of completedVisits) {
      if (visit.completedAt) {
        const application = await Application.query()
          .where('visit_request_id', visit.id)
          .whereNotNull('created_at')
          .orderBy('created_at', 'asc')
          .first()

        if (application) {
          const diff = DateTime.fromJSDate(application.createdAt.toJSDate()).diff(
            DateTime.fromJSDate(visit.completedAt),
            'hours'
          )
          completionToApplication.push(diff.hours)
        }
      }
    }

    // Temps moyen : complétion → contrat
    const completionToContract: number[] = []
    for (const visit of completedVisits) {
      if (visit.completedAt) {
        const contract = await Contract.query()
          .where('visit_request_id', visit.id)
          .whereNotNull('created_at')
          .orderBy('created_at', 'asc')
          .first()

        if (contract) {
          const diff = DateTime.fromJSDate(contract.createdAt.toJSDate()).diff(
            DateTime.fromJSDate(visit.completedAt),
            'hours'
          )
          completionToContract.push(diff.hours)
        }
      }
    }

    const average = (arr: number[]) =>
      arr.length > 0 ? (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2) : null

    return {
      request_to_acceptance: average(requestToAcceptance),
      acceptance_to_completion: average(acceptanceToCompletion),
      completion_to_application: average(completionToApplication),
      completion_to_contract: average(completionToContract),
    }
  }

  /**
   * Retourne des statistiques vides
   */
  private getEmptyStatistics() {
    return {
      total_requests: 0,
      by_status: [],
      completed_visits: 0,
      visits_with_applications: 0,
      visits_with_contracts: 0,
      no_show_count: 0,
      auto_cancelled_count: 0,
      conversion_rates: {
        visit_to_application: '0.00',
        visit_to_contract: '0.00',
        application_to_contract: '0.00',
      },
      average_times: {
        request_to_acceptance: null,
        acceptance_to_completion: null,
        completion_to_application: null,
        completion_to_contract: null,
      },
    }
  }
}
