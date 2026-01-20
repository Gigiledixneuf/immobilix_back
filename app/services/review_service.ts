import db from '@adonisjs/lucid/services/db'
import Review from '#models/review'
import VisitRequest, { VisitRequestStatus } from '#models/visit_request'

type ReviewStats = { total: number; average: number }

export default class ReviewService {
  private buildPropertyReviewFilter(query: ReturnType<typeof Review.query>) {
    return query.where((builder) => {
      builder.where('review_type', 'property').orWhereNull('review_type')
    })
  }

  private async getPropertyReviewStats(propertyId: number): Promise<ReviewStats> {
    const rows = await db
      .from('reviews')
      .where('property_id', propertyId)
      .where((builder) => {
        builder.where('review_type', 'property').orWhereNull('review_type')
      })
      .count('* as total')
      .avg('rating as average')

    const total = Number(rows?.[0]?.total ?? 0)
    const average = Number(rows?.[0]?.average ?? 0)

    return { total, average }
  }

  private async assertVisitReviewable(visitRequest: VisitRequest) {
    if (visitRequest.status !== VisitRequestStatus.COMPLETED) {
      throw new Error('La visite doit être complétée pour laisser un avis')
    }

    if (!visitRequest.completedByLandlord || !visitRequest.completedByTenant) {
      throw new Error('La visite doit être confirmée par le bailleur et le locataire')
    }
  }

  private async ensureUniqueReview(visitRequestId: number, userId: number) {
    const existing = await Review.query()
      .where('visit_request_id', visitRequestId)
      .where('user_id', userId)
      .first()

    if (existing) {
      throw new Error('Un seul avis est autorisé par visite et par auteur')
    }
  }

  async createPropertyReview(payload: {
    visitRequestId: number
    userId: number
    rating: number
    comment?: string | null
  }) {
    const visitRequest = await VisitRequest.query()
      .where('id', payload.visitRequestId)
      .preload('property')
      .preload('tenant')
      .first()

    if (!visitRequest) {
      throw new Error('Demande de visite introuvable')
    }

    if (!visitRequest.property) {
      throw new Error('Propriété introuvable pour cette visite')
    }

    await this.assertVisitReviewable(visitRequest)

    if (visitRequest.tenantId !== payload.userId) {
      throw new Error('Seul le locataire peut laisser un avis sur la propriété')
    }

    await this.ensureUniqueReview(visitRequest.id, payload.userId)

    return Review.create({
      visitRequestId: visitRequest.id,
      propertyId: visitRequest.propertyId,
      userId: payload.userId,
      rating: payload.rating,
      comment: payload.comment ?? null,
      reviewType: 'property',
    })
  }

  async createTenantReview(payload: {
    visitRequestId: number
    userId: number
    rating: number
    comment?: string | null
  }) {
    const visitRequest = await VisitRequest.query()
      .where('id', payload.visitRequestId)
      .preload('property')
      .preload('tenant')
      .first()

    if (!visitRequest) {
      throw new Error('Demande de visite introuvable')
    }

    if (!visitRequest.property) {
      throw new Error('Propriété introuvable pour cette visite')
    }

    await this.assertVisitReviewable(visitRequest)

    if (visitRequest.property.user_id !== payload.userId) {
      throw new Error('Seul le bailleur peut laisser un avis sur le locataire')
    }

    await this.ensureUniqueReview(visitRequest.id, payload.userId)

    return Review.create({
      visitRequestId: visitRequest.id,
      propertyId: visitRequest.propertyId,
      userId: payload.userId,
      reviewedUserId: visitRequest.tenantId,
      rating: payload.rating,
      comment: payload.comment ?? null,
      reviewType: 'tenant',
    })
  }

  async getPropertyReviews(propertyId: number, options?: { page?: number; limit?: number }) {
    const stats = await this.getPropertyReviewStats(propertyId)
    const page = options?.page ?? 1
    const limit = options?.limit

    const baseQuery = this.buildPropertyReviewFilter(
      Review.query()
        .where('property_id', propertyId)
        .orderBy('created_at', 'desc')
        .preload('user', (userQuery) =>
          userQuery.select(['id', 'uuid', 'fullName', 'profilePhotoUrl'])
        )
        .preload('property', (propertyQuery) => propertyQuery.select(['id', 'uuid']))
        .preload('visitRequest', (visitQuery) => visitQuery.select(['id', 'uuid']))
        .preload('reviewee', (revieweeQuery) => revieweeQuery.select(['id', 'uuid']))
    )

    if (limit) {
      const paginated = await baseQuery.paginate(page, limit)
      return {
        stats,
        meta: paginated.getMeta(),
        reviews: paginated.all(),
      }
    }

    const reviews = await baseQuery
    return { stats, meta: null, reviews }
  }

  async getTenantReviews(tenantId: number, options?: { page?: number; limit?: number }) {
    const page = options?.page ?? 1
    const limit = options?.limit ?? 20

    const paginated = await Review.query()
      .where('review_type', 'tenant')
      .where('reviewed_user_id', tenantId)
      .orderBy('created_at', 'desc')
      .preload('user', (userQuery) =>
        userQuery.select(['id', 'uuid', 'fullName', 'profilePhotoUrl'])
      )
      .preload('property', (propertyQuery) => propertyQuery.select(['id', 'uuid']))
      .preload('visitRequest', (visitQuery) => visitQuery.select(['id', 'uuid']))
      .preload('reviewee', (revieweeQuery) => revieweeQuery.select(['id', 'uuid']))
      .paginate(page, limit)

    return {
      meta: paginated.getMeta(),
      reviews: paginated.all(),
    }
  }

  async getPropertyReviewSummaries(propertyIds: number[], limitPerProperty = 5) {
    if (propertyIds.length === 0) {
      return {
        statsByProperty: new Map<number, ReviewStats>(),
        reviewsByProperty: new Map<number, Review[]>(),
      }
    }

    const statsRows = await db
      .from('reviews')
      .select('property_id')
      .whereIn('property_id', propertyIds)
      .where((builder) => {
        builder.where('review_type', 'property').orWhereNull('review_type')
      })
      .count('* as total')
      .avg('rating as average')
      .groupBy('property_id')

    const statsByProperty = new Map<number, ReviewStats>()
    statsRows.forEach((row) => {
      const propertyId = Number(row.property_id)
      statsByProperty.set(propertyId, {
        total: Number(row.total ?? 0),
        average: Number(row.average ?? 0),
      })
    })

    const reviews = await this.buildPropertyReviewFilter(
      Review.query()
        .whereIn('property_id', propertyIds)
        .orderBy('created_at', 'desc')
        .preload('user', (userQuery) =>
          userQuery.select(['id', 'uuid', 'fullName', 'profilePhotoUrl'])
        )
    )

    const reviewsByProperty = new Map<number, Review[]>()
    reviews.forEach((review) => {
      const propertyId = Number(review.propertyId)
      if (!reviewsByProperty.has(propertyId)) {
        reviewsByProperty.set(propertyId, [])
      }
      const list = reviewsByProperty.get(propertyId)!
      if (list.length < limitPerProperty) {
        list.push(review)
      }
    })

    return { statsByProperty, reviewsByProperty }
  }
}
