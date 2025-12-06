import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import PaymentsService, { WebhookPayload } from '#services/payments_service'
import Payment, { PaymentStatus } from '#models/payment'
import NotificationsService from '#services/notifications_service'
import FlutterwaveProvider from '#services/mobile_money/flutterwave_provider'
import WebhookEvent from '#models/webhook_event'

export default class WebhooksController {
  constructor(protected paymentsService: PaymentsService = new PaymentsService()) {}

  /**
   * POST /api/webhook/payment
   * Réception du webhook de paiement Mobile Money / agrégateur
   * 
   * Améliorations de sécurité :
   * - Vérification de signature complète
   * - Vérification du montant payé vs montant attendu
   * - Système d'idempotence (protection contre les webhooks dupliqués)
   */
  async payment({ request, response }: HttpContext) {
    const body = request.all() as WebhookPayload & { paymentId?: number; data?: any }

    // Générer un ID unique pour ce webhook (transaction_id ou référence)
    const eventId = body.transactionId || body.reference || body.data?.id || `webhook_${Date.now()}`

    // ============================================
    // 1. IDEMPOTENCE : Vérifier si ce webhook a déjà été traité
    // ============================================
    const existingEvent = await WebhookEvent.query()
      .where('event_id', eventId)
      .where('provider', body.provider || 'FLUTTERWAVE')
      .first()

    if (existingEvent) {
      if (existingEvent.status === 'processed') {
        logger.info({ eventId, paymentId: existingEvent.paymentId }, 'Webhook déjà traité (idempotence)')
        return response.ok({
          message: 'Webhook déjà traité',
          data: { eventId, paymentId: existingEvent.paymentId },
        })
      }

      // Si l'événement a échoué précédemment, incrémenter le retry count
      if (existingEvent.status === 'failed') {
        existingEvent.retryCount = (existingEvent.retryCount || 0) + 1
        await existingEvent.save()
      }
    }

    // Enregistrer le webhook reçu (pendant traitement)
    const webhookEvent = existingEvent || await WebhookEvent.create({
      eventId,
      eventType: 'payment',
      provider: body.provider || 'FLUTTERWAVE',
      payload: body,
      status: 'pending',
      retryCount: 0,
    })

    try {
      // ============================================
      // 2. VÉRIFICATION DE SIGNATURE
      // ============================================
      const flwSig = request.header('verif-hash') || request.header('x-flutterwave-signature')
      if (flwSig) {
        const flw = new FlutterwaveProvider()
        const isValidSignature = flw.verifyWebhookSignature(flwSig)
        
        if (!isValidSignature) {
          webhookEvent.status = 'failed'
          webhookEvent.errorMessage = 'Signature webhook invalide'
          await webhookEvent.save()

          logger.warn({ eventId, signature: flwSig?.substring(0, 20) }, 'Webhook avec signature invalide rejeté')
          return response.unauthorized({ message: 'Signature webhook invalide' })
        }
      } else {
        // En production, exiger toujours une signature
        if (process.env.NODE_ENV === 'production') {
          webhookEvent.status = 'failed'
          webhookEvent.errorMessage = 'Signature manquante en production'
          await webhookEvent.save()

          logger.warn({ eventId }, 'Webhook sans signature rejeté en production')
          return response.unauthorized({ message: 'Signature webhook requise' })
        }
      }

      // ============================================
      // 3. IDENTIFICATION DU PAIEMENT
      // ============================================
      let payment: Payment | null = null
      
      // Tentative 1: Par paymentId direct
      if (body.paymentId) {
        payment = await Payment.find(body.paymentId)
      }
      
      // Tentative 2: Par transactionId
      if (!payment && body.transactionId) {
        payment = await Payment.query().where('transaction_id', body.transactionId).first()
      }
      
      // Tentative 3: Par référence (Flutterwave tx_ref)
      if (!payment && body.reference) {
        payment = await Payment.query().where('transaction_id', body.reference).first()
      }
      
      // Tentative 4: Par référence dans les données Flutterwave
      if (!payment && body.data?.tx_ref) {
        payment = await Payment.query().where('transaction_id', body.data.tx_ref).first()
      }

      if (!payment) {
        webhookEvent.status = 'failed'
        webhookEvent.errorMessage = `Paiement introuvable pour eventId: ${eventId}`
        await webhookEvent.save()

        logger.warn({ eventId, body }, 'Webhook reçu pour paiement introuvable')
        return response.notFound({ message: 'Paiement introuvable' })
      }

      // Mettre à jour l'événement avec l'ID du paiement
      webhookEvent.paymentId = payment.id
      await webhookEvent.save()

      // ============================================
      // 4. VÉRIFICATION DU MONTANT
      // ============================================
      const webhookAmount = body.amount || body.data?.amount
      if (webhookAmount !== undefined && webhookAmount !== null) {
        const expectedAmount = Number(payment.amount)
        const receivedAmount = Number(webhookAmount)
        
        // Tolérance de 0.01 pour les erreurs d'arrondi
        const tolerance = 0.01
        const amountDifference = Math.abs(expectedAmount - receivedAmount)
        
        if (amountDifference > tolerance) {
          webhookEvent.status = 'failed'
          webhookEvent.errorMessage = `Montant invalide: attendu ${expectedAmount}, reçu ${receivedAmount}`
          await webhookEvent.save()

          logger.error(
            { 
              eventId, 
              paymentId: payment.id,
              expectedAmount, 
              receivedAmount,
              difference: amountDifference,
            },
            'Webhook rejeté: montant incorrect'
          )
          
          payment.status = PaymentStatus.FAILED
          await payment.save()
          
          return response.badRequest({
            message: `Montant incorrect: attendu ${expectedAmount}, reçu ${receivedAmount}`,
            data: { expectedAmount, receivedAmount },
          })
        }
      }

      // ============================================
      // 5. VÉRIFICATION DU STATUT DU PAIEMENT
      // ============================================
      const result = await this.paymentsService.verifyPayment(body)
      if (!result.valid) {
        webhookEvent.status = 'failed'
        webhookEvent.errorMessage = 'Paiement non valide selon le provider'
        await webhookEvent.save()

        payment.status = PaymentStatus.FAILED
        await payment.save()

        logger.warn({ eventId, paymentId: payment.id }, 'Paiement marqué comme invalide')
        return response.ok({ message: 'Paiement non valide', data: payment })
      }

      // ============================================
      // 6. MISE À JOUR DU PAIEMENT
      // ============================================
      // Ne mettre à jour que si le paiement n'est pas déjà payé (idempotence)
      if (payment.status !== PaymentStatus.PAID) {
        if (result.txid) {
          payment.transactionId = result.txid
        }
        payment.status = PaymentStatus.PAID
        await payment.save()

        // Notifier le bailleur/locataire
        const notifier = new NotificationsService()
        await notifier.notifyUser(
          payment.contractId,
          'Paiement confirmé',
          'Votre paiement a été confirmé',
          'payment',
          {
            paymentId: payment.id,
            amount: payment.amount,
          }
        )

        logger.info({ eventId, paymentId: payment.id }, 'Paiement confirmé avec succès')
      } else {
        logger.info({ eventId, paymentId: payment.id }, 'Paiement déjà confirmé (idempotence)')
      }

      // ============================================
      // 7. MARQUER L'ÉVÉNEMENT COMME TRAITÉ
      // ============================================
      webhookEvent.status = 'processed'
      await webhookEvent.save()

      return response.ok({ message: 'Paiement confirmé', data: payment })
    } catch (error) {
      // Gestion d'erreur
      webhookEvent.status = 'failed'
      webhookEvent.errorMessage = error instanceof Error ? error.message : String(error)
      await webhookEvent.save()

      logger.error(
        {
          eventId,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Erreur lors du traitement du webhook'
      )

      return response.internalServerError({
        message: 'Erreur lors du traitement du webhook',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}
