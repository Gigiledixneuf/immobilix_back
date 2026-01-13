import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import Contract from '#models/contract'
import Property from '#models/property'
import User from '#models/user'
import { StoreContractValidator, UpdateContractValidator } from '#validators/contract'
import { DateTime } from 'luxon'
import HederaService, { HederaContractData } from '#services/hedera_service'

@inject()
export default class ContractsController {
  // 🎯 INJECTION DE DÉPENDANCE : Le service Hedera est injecté
  constructor(protected hederaService: HederaService) {}

  /**
   * 📜 Liste des contrats de l'utilisateur connecté
   */
  async index({ auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'You are not authorized' })

    // ISOLATION STRICTE : Filtrer par rôle actif
    if (!user.activeRole) {
      return response.forbidden({
        message: 'Aucun rôle actif défini. Veuillez sélectionner un rôle dans votre profil.',
      })
    }

    let contracts

    // En mode BAILLEUR : voir les contrats de ses propriétés
    if (user.activeRole === 'landlord') {
      const userProperties = await Property.query().where('user_id', user.id).select('id')
      const propertyIds = userProperties.map((prop) => prop.id)

      if (propertyIds.length === 0) {
        contracts = []
      } else {
        contracts = await Contract.query()
          .whereIn('propertyId', propertyIds)
          .preload('property')
          .preload('tenant')
      }
    }
    // En mode LOCATAIRE : voir seulement ses propres contrats
    else if (user.activeRole === 'tenant') {
      contracts = await Contract.query()
        .where('tenantId', user.id)
        .preload('property')
        .preload('tenant')
    }
    // Rôle actif invalide
    else {
      return response.forbidden({
        message: "Vous n'avez pas accès aux contrats",
      })
    }

    return response.ok({
      message: 'Liste des contrats récupérée',
      data: contracts,
    })
  }

  /**
   * 🆕 Créer un nouveau contrat
   */
  async store({ request, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'You are not authorized' })

    // ISOLATION STRICTE : Seuls les utilisateurs en mode BAILLEUR peuvent créer un contrat
    if (user.activeRole !== 'landlord') {
      return response.forbidden({
        message: 'Vous devez être en mode BAILLEUR pour créer un contrat. Changez de rôle dans votre profil.',
      })
    }

    const payload = await request.validateUsing(StoreContractValidator)

    // Vérifier que la propriété existe
    const property = await Property.find(payload.propertyId)
    if (!property) {
      return response.notFound({ message: 'Propriété introuvable' })
    }

    // Vérifier que le locataire existe et a le bon rôle
    const tenant = await User.find(payload.tenantId)
    if (!tenant) {
      return response.notFound({ message: 'Locataire introuvable' })
    }

    await tenant.load('roles')
    const isTenant = tenant.roles?.some((role) => role.name === 'locataire') ?? false
    if (!isTenant) {
      return response.badRequest({
        message: "L'utilisateur spécifié n'est pas un locataire",
      })
    }

    // Vérifier que le bailleur peut créer un contrat pour cette propriété
    const userProperty = await Property.query()
      .where('id', payload.propertyId)
      .where('user_id', user.id)
      .first()

    if (!userProperty) {
      return response.forbidden({
        message: 'Vous ne pouvez créer des contrats que pour vos propres propriétés',
      })
    }

    // Validation des dates
    const startDate = payload.startDate
    const endDate = payload.endDate

    if (startDate && endDate && endDate <= startDate) {
      return response.badRequest({
        message: 'La date de fin doit être après la date de début',
      })
    }

    if (startDate && startDate < DateTime.now().startOf('day')) {
      return response.badRequest({
        message: 'La date de début ne peut pas être dans le passé',
      })
    }

    // Validation du dépôt de garantie
    if (payload.depositMonths > 0 && (!payload.depositAmount || payload.depositAmount <= 0)) {
      return response.badRequest({
        message:
          'Un montant de dépôt est requis lorsque le nombre de mois de dépôt est supérieur à 0',
      })
    }

    // Vérifier les chevauchements de contrats
    const existingContract = await Contract.query()
      .where('propertyId', payload.propertyId)
      .where('status', 'active')
      .where((query) => {
        if (startDate) {
          query.whereNull('endDate').orWhere('endDate', '>=', startDate.toSQL()!)
        } else {
          query.whereNull('endDate')
        }
      })
      .first()

    if (existingContract) {
      return response.badRequest({
        message: 'Un contrat actif existe déjà pour cette propriété sur cette période',
      })
    }

    // Création du contrat dans la base de données
    const contract = await Contract.create({
      user_id: user.id, // ID du bailleur (propriétaire)
      propertyId: payload.propertyId,
      tenantId: payload.tenantId,
      startDate: startDate,
      endDate: endDate || null,
      description: payload.description,
      rentAmount: payload.rentAmount,
      currency: payload.currency,
      status: payload.status || 'pending',
      depositMonths: payload.depositMonths || 0,
      depositAmount: payload.depositAmount || null,
      depositStatus: payload.depositStatus || 'unpaid',
    })

    // ➡️ Appel du service Hedera (Master Contract Pattern)
    try {
      // 💡 Conversion en HederaContractData typée
      const hederaData: HederaContractData = {
        contractId: contract.id, // 💡 ID de la DB utilisé comme clé on-chain
        landlordId: user.id,
        tenantId: tenant.id,
        endDate: endDate || null,
        rentAmount: payload.rentAmount,
        currency: payload.currency,
        status: payload.status || 'pending',
        depositMonths: payload.depositMonths || 0,
        depositAmount: payload.depositAmount || null,
        depositStatus: payload.depositStatus || 'unpaid',
      }

      const hederaContratId = await this.hederaService.createContratOnChain(hederaData)

      // Sauvegarde l'ID du Smart Contract Master (Master Contract ID)
      contract.hederaContractId = hederaContratId
      await contract.save()
    } catch (error) {
      const logger = (await import('@adonisjs/core/services/logger')).default
      logger.error('Erreur lors de la création du contrat Hedera', { 
        error, 
        contractId: contract.id,
        propertyId: payload.propertyId 
      })
      // NOTE: En production, vous pourriez vouloir annuler la transaction DB ou marquer le contrat comme 'Hedera_failed'
    }

    // Charger les relations pour la réponse
    await contract.load('property')
    await contract.load('tenant')

    return response.created({
      message: 'Contrat créé avec succès',
      data: contract,
    })
  }

  /**
   * 👀 Afficher un contrat (seulement si l'utilisateur y a accès)
   */
  async show({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'You are not authorized' })

    const contract = await Contract.query()
      .where('id', params.id)
      .preload('property')
      .preload('tenant')
      .first()

    if (!contract) {
      return response.notFound({ message: 'Contrat introuvable' })
    }

    // ISOLATION STRICTE : Vérifier l'accès selon le rôle actif
    if (!user.activeRole) {
      return response.forbidden({
        message: 'Aucun rôle actif défini. Veuillez sélectionner un rôle dans votre profil.',
      })
    }

    let hasAccess = false

    if (user.activeRole === 'landlord') {
      const property = await Property.find(contract.propertyId)
      hasAccess = property?.user_id === user.id
    } else if (user.activeRole === 'tenant') {
      hasAccess = contract.tenantId === user.id
    }

    if (!hasAccess) {
      return response.forbidden({
        message: "Vous n'avez pas accès à ce contrat",
      })
    }

    return response.ok({
      message: 'Détails du contrat',
      data: contract,
    })
  }

  /**
   * 💰 Payer la caution/dépôt d’un contrat (intention de paiement)
   * POST /api/contracts/:id/pay-deposit
   */
  /**
   * ✏️ Modifier un contrat
   */
  async update({ params, request, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'You are not authorized' })

    const contract = await Contract.find(params.id)
    if (!contract) {
      return response.notFound({ message: 'Contrat introuvable' })
    }

    // ISOLATION STRICTE : Seuls les utilisateurs en mode BAILLEUR peuvent modifier
    if (user.activeRole !== 'landlord') {
      return response.forbidden({
        message: 'Vous devez être en mode BAILLEUR pour modifier un contrat. Changez de rôle dans votre profil.',
      })
    }

    // Vérifier que le bailleur possède la propriété du contrat
    const property = await Property.find(contract.propertyId)
    if (!property) {
      return response.notFound({ message: 'Propriété du contrat introuvable' })
    }

    if (property.user_id !== user.id) {
      return response.forbidden({
        message: 'Vous ne pouvez modifier que les contrats de vos propres propriétés',
      })
    }

    const payload = await request.validateUsing(UpdateContractValidator)

    // Vérifications supplémentaires si modification de propriété
    if (payload.propertyId !== undefined) {
      const newProperty = await Property.find(payload.propertyId)
      if (!newProperty) {
        return response.notFound({ message: 'Nouvelle propriété introuvable' })
      }

      // Vérifier que le bailleur possède la nouvelle propriété
      if (newProperty.user_id !== user.id) {
        return response.forbidden({
          message: 'Vous ne pouvez assigner que vos propres propriétés',
        })
      }
    }

    if (payload.tenantId !== undefined) {
      const tenant = await User.find(payload.tenantId)
      if (!tenant) {
        return response.notFound({ message: 'Locataire introuvable' })
      }

      await tenant.load('roles')
      const isTenant = tenant.roles?.some((role) => role.name === 'locataire') ?? false
      if (!isTenant) {
        return response.badRequest({
          message: "L'utilisateur spécifié n'est pas un locataire",
        })
      }
    }

    // Validation des dates
    const startDate = payload.startDate || contract.startDate
    const endDate = payload.endDate !== undefined ? payload.endDate : contract.endDate

    if (startDate && endDate && endDate <= startDate) {
      return response.badRequest({
        message: 'La date de fin doit être après la date de début',
      })
    }

    // Validation du dépôt de garantie
    const depositMonths = payload.depositMonths ?? contract.depositMonths
    const depositAmount = payload.depositAmount ?? contract.depositAmount

    if (depositMonths > 0 && (!depositAmount || depositAmount <= 0)) {
      return response.badRequest({
        message:
          'Un montant de dépôt est requis lorsque le nombre de mois de dépôt est supérieur à 0',
      })
    }

    // Mise à jour du contrat dans la base de données
    contract.merge({
      ...payload,
      startDate: payload.startDate || contract.startDate,
      endDate: payload.endDate !== undefined ? payload.endDate : contract.endDate,
    })

    await contract.save()

    // ➡️ Mise à jour du Smart Contract Hedera
    if (contract.hederaContractId) {
      try {
        const updatesForHedera = {
          dbContractId: contract.id, // 💡 ID de la DB pour cibler le bail dans le Master Contract
          newEndDate: payload.endDate || contract.endDate,
          newStatus: payload.status || contract.status,
        }

        await this.hederaService.updateContractOnChain(updatesForHedera)
      } catch (error) {
        const logger = (await import('@adonisjs/core/services/logger')).default
        logger.error('Erreur lors de la mise à jour du contrat Hedera', { 
          error, 
          contractId: contract.id 
        })
      }
    }

    // Recharger les relations
    await contract.load('property')
    await contract.load('tenant')

    return response.ok({
      message: 'Contrat mis à jour avec succès',
      data: contract,
    })
  }

  /**
   * 🗑️ Supprimer un contrat
   */
  async destroy({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'You are not authorized' })

    const contract = await Contract.find(params.id)
    if (!contract) {
      return response.notFound({ message: 'Contrat introuvable' })
    }

    // ISOLATION STRICTE : Seuls les utilisateurs en mode BAILLEUR peuvent supprimer
    if (user.activeRole !== 'landlord') {
      return response.forbidden({
        message: 'Vous devez être en mode BAILLEUR pour supprimer un contrat. Changez de rôle dans votre profil.',
      })
    }

    // Vérifier que le bailleur possède la propriété du contrat
    const property = await Property.find(contract.propertyId)
    if (!property || property.user_id !== user.id) {
      return response.forbidden({
        message: "Vous n'avez pas la permission de supprimer ce contrat",
      })
    }

    // Résilier le contrat sur la chaîne Hedera si présent
    if (contract.hederaContractId) {
      try {
        await this.hederaService.terminateLease(contract.id)
      } catch (error) {
        const logger = (await import('@adonisjs/core/services/logger')).default
        logger.error('Erreur lors de la résiliation du contrat Hedera', { 
          error, 
          contractId: contract.id 
        })
        // On continue quand même avec la suppression en DB
      }
    }

    await contract.delete()

    return response.ok({
      message: 'Contrat supprimé avec succès',
    })
  }
}
