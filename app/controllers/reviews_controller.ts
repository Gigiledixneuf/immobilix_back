import type { HttpContext } from '@adonisjs/core/http'
import ReviewService from '#services/review_service'
import { CreateReviewValidator } from '#validators/review'
import Review from '#models/review'
import Property from '#models/property'
import User from '#models/user'
import VisitRequest from '#models/visit_request'
import { ensureUuid } from '#utils/uuid'

export default class ReviewsController {
  private reviewService = new ReviewService()

  private serializeReview(review: Review) {
    return {
      id: review.uuid,
      rating: review.rating,
      comment: review.comment,
      reviewType: review.reviewType,
      propertyId: review.property?.uuid ?? null,
      visitRequestId: review.visitRequest?.uuid ?? null,
      reviewedUserId: review.reviewee?.uuid ?? null,
      createdAt: review.createdAt,
      reviewer: review.user
        ? {
            id: review.user.uuid,
            fullName: review.user.fullName,
            profilePhotoUrl: review.user.profilePhotoUrl,
          }
        : null,
    }
  }

  async storeProperty({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    const payload = await request.validateUsing(CreateReviewValidator)

    try {
      ensureUuid(payload.visit_request_id, 'UUID de visite invalide')
      const visitRequest = await VisitRequest.findBy('uuid', payload.visit_request_id)
      if (!visitRequest) {
        return response.notFound({ status: 'error', message: 'Visite introuvable' })
      }
      const review = await this.reviewService.createPropertyReview({
        visitRequestId: visitRequest.id,
        userId: user.id,
        rating: payload.rating,
        comment: payload.comment,
      })

      await review.load('user')
      await review.load('property')
      await review.load('visitRequest')
      await review.load('reviewee')

      return response.created({
        status: 'success',
        message: 'Avis enregistré',
        data: this.serializeReview(review),
      })
    } catch (error: any) {
      return response.badRequest({
        status: 'error',
        message: error.message || 'Erreur lors de la création de l’avis',
      })
    }
  }

  async storeTenant({ auth, request, response }: HttpContext) {
    const user = auth.user
    if (!user) {
      return response.unauthorized({ message: 'Non authentifié' })
    }

    const payload = await request.validateUsing(CreateReviewValidator)

    try {
      ensureUuid(payload.visit_request_id, 'UUID de visite invalide')
      const visitRequest = await VisitRequest.findBy('uuid', payload.visit_request_id)
      if (!visitRequest) {
        return response.notFound({ status: 'error', message: 'Visite introuvable' })
      }
      const review = await this.reviewService.createTenantReview({
        visitRequestId: visitRequest.id,
        userId: user.id,
        rating: payload.rating,
        comment: payload.comment,
      })

      await review.load('user')
      await review.load('property')
      await review.load('visitRequest')
      await review.load('reviewee')

      return response.created({
        status: 'success',
        message: 'Avis enregistré',
        data: this.serializeReview(review),
      })
    } catch (error: any) {
      return response.badRequest({
        status: 'error',
        message: error.message || 'Erreur lors de la création de l’avis',
      })
    }
  }

  async propertyReviews({ params, request, response }: HttpContext) {
    ensureUuid(params.propertyId, 'UUID de propriété invalide')
    const property = await Property.findBy('uuid', params.propertyId)
    if (!property) {
      return response.notFound({ status: 'error', message: 'Propriété introuvable' })
    }
    const page = Number(request.input('page', 1))
    const limit = Number(request.input('limit', 20))

    const result = await this.reviewService.getPropertyReviews(property.id, { page, limit })

    return response.ok({
      status: 'success',
      data: {
        stats: {
          averageRating: Math.round(result.stats.average * 10) / 10,
          totalReviews: result.stats.total,
        },
        reviews: result.reviews.map((review) => this.serializeReview(review)),
        meta: result.meta,
      },
    })
  }

  async tenantReviews({ params, request, response }: HttpContext) {
    ensureUuid(params.tenantId, 'UUID de locataire invalide')
    const tenant = await User.findBy('uuid', params.tenantId)
    if (!tenant) {
      return response.notFound({ status: 'error', message: 'Locataire introuvable' })
    }
    const page = Number(request.input('page', 1))
    const limit = Number(request.input('limit', 20))

    const result = await this.reviewService.getTenantReviews(tenant.id, { page, limit })

    return response.ok({
      status: 'success',
      data: {
        reviews: result.reviews.map((review) => this.serializeReview(review)),
        meta: result.meta,
      },
    })
  }
}
