import type { HttpContext } from '@adonisjs/core/http'
import { inject } from '@adonisjs/core'
import Invoice, { InvoiceStatus } from '#models/invoice'
import Contract from '#models/contract'
import Property from '#models/property'
import User from '#models/user'
import { DateTime } from 'luxon'
import Payment from '#models/payment'
import { PaymentMethods, PaymentStatus } from '#models/payment'
import NotificationsService from '#services/notifications_service'
import HederaService from '#services/hedera_service'

@inject()
export default class InvoicesController {
  constructor(protected hederaService: HederaService) {}
  /**
   * GET /api/invoices
   * Récupère les factures selon le rôle de l'utilisateur
   * - Bailleur : voit toutes ses factures (de ses propriétés)
   * - Locataire : voit ses propres factures
   */
  async index({ auth, request, response }: HttpContext) {
    const user = auth.user!
    await user.load('roles')
    const userRoles = user.roles?.map((role) => role.name) || []

    const status = request.qs().status as string | undefined
    const contractId = request.qs().contractId as string | undefined

    let invoices

    if (userRoles.includes('bailleur')) {
      // Le bailleur voit les factures de toutes ses propriétés
      const userProperties = await Property.query().where('user_id', user.id).select('id')
      const propertyIds = userProperties.map((prop) => prop.id)

      const userContracts = await Contract.query()
        .whereIn('propertyId', propertyIds)
        .select('id')
      const contractIds = userContracts.map((c) => c.id)

      let invoiceQuery = Invoice.query()
        .whereIn('contractId', contractIds)
        .preload('contract', (query) => {
          query.preload('property').preload('tenant')
        })
        .preload('tenant')
        .orderBy('dueDate', 'desc')

      if (status) {
        invoiceQuery = invoiceQuery.where('status', status as InvoiceStatus)
      }
      if (contractId) {
        invoiceQuery = invoiceQuery.where('contractId', Number(contractId))
      }
      
      invoices = await invoiceQuery
    } else if (userRoles.includes('locataire')) {
      // Le locataire voit seulement ses propres factures
      let invoiceQuery = Invoice.query()
        .where('tenantId', user.id)
        .preload('contract', (query) => {
          query.preload('property')
        })
        .preload('landlord')
        .orderBy('dueDate', 'desc')

      if (status) {
        invoiceQuery = invoiceQuery.where('status', status as InvoiceStatus)
      }
      if (contractId) {
        invoiceQuery = invoiceQuery.where('contractId', Number(contractId))
      }
      
      invoices = await invoiceQuery
    } else {
      return response.forbidden({
        message: "Vous n'avez pas accès aux factures",
      })
    }

    return response.ok({
      message: 'Factures récupérées avec succès',
      data: await invoices,
    })
  }

  /**
   * GET /api/invoices/:id
   * Récupère les détails d'une facture
   */
  async show({ params, auth, response }: HttpContext) {
    const user = auth.user!
    await user.load('roles')
    const userRoles = user.roles?.map((role) => role.name) || []

    const invoice = await Invoice.query()
      .where('id', params.id)
      .preload('contract', (query) => {
        query.preload('property').preload('tenant')
      })
      .preload('tenant')
      .preload('landlord')
      .first()

    if (!invoice) {
      return response.notFound({ message: 'Facture introuvable' })
    }

    // Vérifier les permissions
    let hasAccess = false

    if (userRoles.includes('bailleur')) {
      const property = await Property.find(
        (await invoice.load('contract')).contract.propertyId
      )
      hasAccess = property?.user_id === user.id
    } else if (userRoles.includes('locataire')) {
      hasAccess = invoice.tenantId === user.id
    } else if (userRoles.includes('admin')) {
      hasAccess = true
    }

    if (!hasAccess) {
      return response.forbidden({
        message: "Vous n'avez pas accès à cette facture",
      })
    }

    return response.ok({
      message: 'Détails de la facture',
      data: invoice,
    })
  }

  /**
   * GET /api/invoices/pending
   * Récupère les factures en attente de paiement (pour le locataire)
   */
  async pending({ auth, response }: HttpContext) {
    const user = auth.user!
    await user.load('roles')
    const userRoles = user.roles?.map((role) => role.name) || []

    if (!userRoles.includes('locataire')) {
      return response.forbidden({
        message: 'Seuls les locataires peuvent voir leurs factures en attente',
      })
    }

    const invoices = await Invoice.query()
      .where('tenantId', user.id)
      .where('status', InvoiceStatus.PENDING)
      .preload('contract', (query) => {
        query.preload('property')
      })
      .preload('landlord')
      .orderBy('dueDate', 'asc')

    return response.ok({
      message: 'Factures en attente récupérées',
      data: invoices,
    })
  }

  /**
   * POST /api/invoices/:id/pay
   * Payer une facture (pour le locataire)
   */
  async pay({ params, request, auth, response }: HttpContext) {
    const user = auth.user!
    await user.load('roles')
    const userRoles = user.roles?.map((role) => role.name) || []

    if (!userRoles.includes('locataire')) {
      return response.forbidden({
        message: 'Seuls les locataires peuvent payer des factures',
      })
    }

    const invoice = await Invoice.find(params.id)
    if (!invoice) {
      return response.notFound({ message: 'Facture introuvable' })
    }

    if (invoice.tenantId !== user.id) {
      return response.forbidden({
        message: "Vous n'êtes pas autorisé à payer cette facture",
      })
    }

    if (invoice.status === InvoiceStatus.PAID) {
      return response.badRequest({
        message: 'Cette facture est déjà payée',
      })
    }

    if (invoice.status === InvoiceStatus.CANCELLED) {
      return response.badRequest({
        message: 'Cette facture est annulée',
      })
    }

    const paymentMethod = request.input('paymentMethod', 'MOBILE_MONEY') as PaymentMethods

    // Créer un paiement
    const contract = await Contract.find(invoice.contractId)
    if (!contract) {
      return response.notFound({ message: 'Contrat introuvable' })
    }

    const payment = await Payment.create({
      contractId: contract.id,
      amount: invoice.amount,
      currency: contract.currency as any,
      paymentMethod: paymentMethod,
      status: PaymentStatus.PENDING,
      transactionId: '',
    })

    // Si c'est un paiement crypto, traiter immédiatement
    if (paymentMethod === PaymentMethods.HBAR || paymentMethod === PaymentMethods.USDC) {
      try {
        // S'assurer que le contrat existe on-chain avant de faire le paiement
        if (!contract.hederaContractId) {
          const property = await contract.related('property').query().first()
          const endDate = contract.endDate
          const hederaData = {
            contractId: contract.id,
            landlordId: property ? property.user_id : 0,
            tenantId: contract.tenantId,
            endDate: endDate || null,
            rentAmount: contract.rentAmount,
            currency: contract.currency,
            status: contract.status,
            depositMonths: contract.depositMonths || 0,
            depositAmount: contract.depositAmount || 0,
            depositStatus: contract.depositStatus || 'pending',
          }
          try {
            const hederaContratId = await this.hederaService.createContratOnChain(hederaData as any)
            contract.hederaContractId = hederaContratId
            await contract.save()
          } catch (e) {
            console.error('Hedera create lease failed for invoice payment:', e)
            // On continue vers paiement, mais Hedera refusera si le lease n'existe pas
          }
        }

        // Enregistrer le paiement on-chain
        const transactionId = await this.hederaService.makePaymentOnChain({
          dbContractId: contract.id,
          paymentId: payment.id,
          amount: Math.round(Number(payment.amount)),
          paymentMethod: paymentMethod,
        })

        payment.transactionId = transactionId
        payment.status = PaymentStatus.PAID
        await payment.save()

        invoice.status = InvoiceStatus.PAID
        invoice.paidAt = DateTime.now()
        invoice.transactionHash = transactionId
        await invoice.save()

        // Notification au bailleur
        const notifier = new NotificationsService()
        await notifier.notifyUser(
          invoice.landlordId,
          'Facture payée',
          `La facture #${invoice.id} a été payée par le locataire via ${paymentMethod}`,
          'payment',
          {
            invoiceId: invoice.id,
            amount: invoice.amount,
            contractId: invoice.contractId,
            transactionId: transactionId,
          }
        )
      } catch (error) {
        // En cas d'erreur Hedera, marquer le paiement comme échoué
        payment.status = PaymentStatus.FAILED
        await payment.save()
        console.error('Erreur lors du paiement Hedera pour facture:', error)
        return response.badRequest({
          message: 'Paiement crypto échoué',
          error: error instanceof Error ? error.message : String(error),
        })
      }
    } else {
      // Pour Mobile Money, le paiement sera confirmé via webhook
      // On garde la facture en pending pour l'instant
    }

    await invoice.load('contract')
    await invoice.load('tenant')
    await invoice.load('landlord')

    return response.ok({
      message: 'Paiement initié avec succès',
      data: {
        invoice,
        payment,
      },
    })
  }

  /**
   * POST /api/invoices
   * Créer une facture (pour le bailleur ou automatiquement)
   */
  async store({ request, auth, response }: HttpContext) {
    const user = auth.user!
    await user.load('roles')
    const userRoles = user.roles?.map((role) => role.name) || []

    const contractId = request.input('contractId')
    const amount = request.input('amount')
    const dueDate = request.input('dueDate')
    const description = request.input('description')

    if (!contractId || !amount || !dueDate) {
      return response.badRequest({
        message: 'contractId, amount et dueDate sont requis',
      })
    }

    const contract = await Contract.find(contractId)
    if (!contract) {
      return response.notFound({ message: 'Contrat introuvable' })
    }

    // Charger la propriété pour obtenir le landlordId
    await contract.load('property')
    const property = contract.property

    // Vérifier les permissions
    if (userRoles.includes('bailleur')) {
      if (property.user_id !== user.id) {
        return response.forbidden({
          message: "Vous ne pouvez créer des factures que pour vos propres contrats",
        })
      }
    } else if (!userRoles.includes('admin')) {
      return response.forbidden({
        message: "Vous n'avez pas la permission de créer des factures",
      })
    }

    // Vérifier que le contrat est actif
    if (contract.status !== 'active') {
      return response.badRequest({
        message: 'Seuls les contrats actifs peuvent avoir des factures',
      })
    }

    const invoice = await Invoice.create({
      contractId: contract.id,
      tenantId: contract.tenantId,
      landlordId: property.user_id,
      amount: Number(amount),
      dueDate: DateTime.fromISO(dueDate),
      status: InvoiceStatus.PENDING,
      description: description || null,
    })

    // Notification au locataire
    const notifier = new NotificationsService()
    await notifier.notifyUser(
      contract.tenantId,
      'Nouvelle facture',
      `Une nouvelle facture de ${amount} ${contract.currency} a été créée. Date d'échéance: ${dueDate}`,
      'payment',
      {
        invoiceId: invoice.id,
        amount: invoice.amount,
        contractId: invoice.contractId,
        dueDate: dueDate,
      }
    )

    await invoice.load('contract')
    await invoice.load('tenant')
    await invoice.load('landlord')

    return response.created({
      message: 'Facture créée avec succès',
      data: invoice,
    })
  }

  /**
   * PUT /api/invoices/:id/cancel
   * Annuler une facture (pour le bailleur)
   */
  async cancel({ params, auth, response }: HttpContext) {
    const user = auth.user!
    await user.load('roles')
    const userRoles = user.roles?.map((role) => role.name) || []

    const invoice = await Invoice.find(params.id)
    if (!invoice) {
      return response.notFound({ message: 'Facture introuvable' })
    }

    // Vérifier les permissions
    if (userRoles.includes('bailleur')) {
      const property = await Property.find(
        (await invoice.load('contract')).contract.propertyId
      )
      if (property?.user_id !== user.id) {
        return response.forbidden({
          message: "Vous ne pouvez annuler que vos propres factures",
        })
      }
    } else if (!userRoles.includes('admin')) {
      return response.forbidden({
        message: "Vous n'avez pas la permission d'annuler cette facture",
      })
    }

    if (invoice.status === InvoiceStatus.PAID) {
      return response.badRequest({
        message: 'Impossible d\'annuler une facture déjà payée',
      })
    }

    invoice.status = InvoiceStatus.CANCELLED
    await invoice.save()

    return response.ok({
      message: 'Facture annulée avec succès',
      data: invoice,
    })
  }
}

