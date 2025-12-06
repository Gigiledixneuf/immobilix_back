import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import Contract from '#models/contract'
import Property from '#models/property'
import User from '#models/user'
import { StoreContractValidator, UpdateContractValidator } from '#validators/contract'
import { DateTime } from 'luxon'
import HederaService, { HederaContractData } from '#services/hedera_service'
import Payment from '#models/payment'
import { PaymentMethods, PaymentStatus } from '#models/payment'
import { PayDepositValidator } from '#validators/payment'

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

    await user.load('roles')
    const userRoles = user.roles?.map((role) => role.name) || []

    let contracts

    // Admin voit tous les contrats
    if (userRoles.includes('admin')) {
      contracts = await Contract.query().preload('property').preload('tenant')
    }
    // Propriétaire voit les contrats de ses propriétés
    else if (userRoles.includes('bailleur')) {
      const userProperties = await Property.query().where('user_id', user.id).select('id')
      const propertyIds = userProperties.map((prop) => prop.id)

      contracts = await Contract.query()
        .whereIn('propertyId', propertyIds)
        .preload('property')
        .preload('tenant')
    }
    // Locataire voit seulement ses propres contrats
    else if (userRoles.includes('locataire')) {
      contracts = await Contract.query()
        .where('tenant_id', user.id)
        .preload('property')
        .preload('tenant')
    }
    // Autres rôles non autorisés
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

    await user.load('roles')
    const userRoles = user.roles?.map((role) => role.name) || []

    // Vérifier les permissions
    const canCreateContract = userRoles.some((role) => ['bailleur'].includes(role))

    if (!canCreateContract) {
      return response.forbidden({
        message: "Vous n'avez pas la permission de créer un contrat",
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
    if (userRoles.includes('bailleur') && !userRoles.includes('admin')) {
      const userProperty = await Property.query()
        .where('id', payload.propertyId)
        .where('user_id', user.id)
        .first()

      if (!userProperty) {
        return response.forbidden({
          message: 'Vous ne pouvez créer des contrats que pour vos propres propriétés',
        })
      }
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
      console.log('Erreur lors de la création du contrat Hedera: ', error)
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

    await user.load('roles')
    const userRoles = user.roles?.map((role) => role.name) || []

    // Vérifier les permissions d'accès
    let hasAccess = false

    if (userRoles.includes('admin')) {
      hasAccess = true
    } else if (userRoles.includes('bailleur')) {
      const property = await Property.find(contract.propertyId)
      hasAccess = property?.user_id === user.id
    } else if (userRoles.includes('locataire')) {
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
  async payDeposit({ params, request, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'Non authentifié' })

    const contract = await Contract.find(params.id)
    if (!contract) return response.notFound({ message: 'Contrat introuvable' })

    // Autoriser le locataire lié au contrat à initier le paiement du dépôt
    if (contract.tenantId !== user.id) {
      return response.forbidden({ message: "Vous n'êtes pas le locataire de ce contrat" })
    }

    const payload = await request.validateUsing(PayDepositValidator)
    const amount = payload.amount ?? contract.depositAmount ?? 0
    if (!amount || amount <= 0) {
      return response.badRequest({ message: 'Montant de dépôt invalide' })
    }

    const payment = await Payment.create({
      contractId: contract.id,
      amount,
      currency: contract.currency,
      paymentMethod: payload.paymentMethod as PaymentMethods,
      status: PaymentStatus.PENDING,
    })

    // Si crypto, tenter un paiement on-chain synchronement (HBAR/USDC)
    if (payload.paymentMethod === PaymentMethods.HBAR || payload.paymentMethod === PaymentMethods.USDC) {
      try {
        const txId = await this.hederaService.makePaymentOnChain({
          dbContractId: contract.id,
          paymentId: payment.id,
          amount: payment.amount,
          paymentMethod: payload.paymentMethod,
        })
        payment.transactionId = txId
        payment.status = PaymentStatus.PAID
        await payment.save()
      } catch (e) {
        payment.status = PaymentStatus.FAILED
        await payment.save()
        return response.internalServerError({ message: 'Erreur paiement Hedera', error: String(e) })
      }
    }

    // Pour Mobile Money, le paiement sera confirmé via webhook + queue
    return response.created({ message: 'Intention de paiement créée', data: payment })
  }

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

    await user.load('roles')
    const userRoles = user.roles?.map((role) => role.name) || []

    // 🔒 Vérifier que seul le bailleur peut modifier
    const isBailleur = userRoles.includes('bailleur')
    if (!isBailleur) {
      return response.forbidden({
        message: 'Seuls les bailleurs peuvent modifier les contrats',
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
        console.log('Erreur lors de la mise à jour du contrat Hedera', error)
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

    await user.load('roles')
    const userRoles = user.roles?.map((role) => role.name) || []

    // Vérifier les permissions de suppression
    let canDelete = false

    if (userRoles.includes('admin')) {
      canDelete = true
    } else if (userRoles.includes('bailleur')) {
      const property = await Property.find(contract.propertyId)
      canDelete = property?.user_id === user.id
    }

    if (!canDelete) {
      return response.forbidden({
        message: "Vous n'avez pas la permission de supprimer ce contrat",
      })
    }

    // Résilier le contrat sur la chaîne Hedera si présent
    if (contract.hederaContractId) {
      try {
        await this.hederaService.terminateLease(contract.id)
      } catch (error) {
        console.error('Erreur lors de la résiliation du contrat Hedera:', error)
        // On continue quand même avec la suppression en DB
      }
    }

    await contract.delete()

    return response.ok({
      message: 'Contrat supprimé avec succès',
    })
  }
}
