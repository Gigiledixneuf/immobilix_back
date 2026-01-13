import type { HttpContext } from '@adonisjs/core/http'
import { CreatePropertyQuestionValidator, AnswerPropertyQuestionValidator } from '#validators/property_question'
import Property from '#models/property'
import PropertyQuestion, { PropertyQuestionStatus } from '#models/property_question'
import NotificationsService from '#services/notifications_service'

export default class PropertyQuestionsController {
  /**
   * POST /api/properties/:id/questions
   * Poser une question sur une propriété
   */
  async store({ params, request, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    const propertyId = Number(params.id)
    const property = await Property.find(propertyId)
    if (!property) {
      return response.notFound({ message: 'Logement introuvable' })
    }

    const payload = await request.validateUsing(CreatePropertyQuestionValidator)

    // Créer la question
    const question = await PropertyQuestion.create({
      propertyId: propertyId,
      userId: user.id,
      question: payload.question,
      status: PropertyQuestionStatus.PENDING,
    })

    // Notification au bailleur propriétaire
    const notifier = new NotificationsService()
    await notifier.notifyUser(
      property.user_id,
      'Nouvelle question sur votre propriété',
      `Un utilisateur a posé une question sur "${property.name}"`,
      'property_question',
      {
        propertyId,
        questionId: question.id,
      }
    )

    // Charger les relations pour la réponse
    await question.load('property')
    await question.load('user')

    return response.created({
      status: 'success',
      message: 'Question posée avec succès',
      data: question,
    })
  }

  /**
   * GET /api/properties/:id/questions
   * Lister les questions pour une propriété
   */
  async index({ params, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    const propertyId = Number(params.id)
    const property = await Property.find(propertyId)
    if (!property) {
      return response.notFound({ message: 'Logement introuvable' })
    }

    // Seul le propriétaire peut voir toutes les questions
    // Les autres utilisateurs voient seulement leurs propres questions
    let query = PropertyQuestion.query()
      .where('property_id', propertyId)
      .preload('user', (userQuery) => {
        userQuery.select(['id', 'fullName', 'email'])
      })
      .orderBy('created_at', 'desc')

    if (property.user_id !== user.id) {
      // Si ce n'est pas le propriétaire, ne montrer que ses propres questions
      query = query.where('user_id', user.id)
    }

    const questions = await query

    return response.ok({
      data: questions,
      count: questions.length,
    })
  }

  /**
   * PATCH /api/properties/questions/:id/answer
   * Répondre à une question (bailleur uniquement)
   */
  async answer({ params, request, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    const questionId = Number(params.id)
    const question = await PropertyQuestion.query()
      .where('id', questionId)
      .preload('property')
      .first()

    if (!question) {
      return response.notFound({ message: 'Question introuvable' })
    }

    // ISOLATION STRICTE : Vérifier le rôle actif et l'ownership
    if (user.activeRole !== 'landlord') {
      return response.forbidden({
        message: 'Vous devez être en mode BAILLEUR pour répondre à une question. Changez de rôle dans votre profil.',
      })
    }

    if (question.property.user_id !== user.id) {
      return response.forbidden({ message: "Vous n'êtes pas autorisé à répondre à cette question" })
    }

    const payload = await request.validateUsing(AnswerPropertyQuestionValidator)

    // Mettre à jour la question avec la réponse
    question.answer = payload.answer
    question.status = PropertyQuestionStatus.ANSWERED
    await question.save()

    // Notification à l'utilisateur qui a posé la question
    const notifier = new NotificationsService()
    await notifier.notifyUser(
      question.userId,
      'Réponse à votre question',
      `Le bailleur a répondu à votre question sur "${question.property.name}"`,
      'property_question_answer',
      {
        propertyId: question.propertyId,
        questionId: question.id,
      }
    )

    await question.load('user')

    return response.ok({
      status: 'success',
      message: 'Réponse enregistrée avec succès',
      data: question,
    })
  }
}






