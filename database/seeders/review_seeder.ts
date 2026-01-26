import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Review from '#models/review'
import VisitRequest, { VisitRequestStatus } from '#models/visit_request'

export default class ReviewSeeder extends BaseSeeder {
  public async run() {
    console.log('🌱 Seeding reviews...')

    const visits = await VisitRequest.query()
      .where('status', VisitRequestStatus.COMPLETED)
      .where('completed_by_landlord', true)
      .where('completed_by_tenant', true)
      .preload('property')

    if (visits.length === 0) {
      console.warn('⚠️ No completed visits found. Run visit flow seeders first.')
      return
    }

    const reviewSamples = [
      { rating: 5, comment: 'Super logement, propre et bien situé. Je recommande !' },
      { rating: 4, comment: 'Très bon rapport qualité/prix, quartier calme.' },
      { rating: 3, comment: 'Correct dans l’ensemble, quelques petits points à améliorer.' },
      { rating: 5, comment: 'Propriétaire réactif, expérience parfaite.' },
      { rating: 2, comment: 'Logement sympa mais quelques soucis techniques.' },
      { rating: 4, comment: 'Conforme à l’annonce, j’ai apprécié le séjour.' },
      { rating: 5, comment: 'Excellent ! Propre, lumineux et bien équipé.' },
      { rating: 3, comment: 'Bien placé, mais un peu bruyant la nuit.' },
    ]

    let created = 0

    for (const visit of visits) {
      const sampleIndex = visit.id % reviewSamples.length
      const tenantSample = reviewSamples[sampleIndex]
      const landlordSample = reviewSamples[(sampleIndex + 2) % reviewSamples.length]

      // Tenant review about property
      const tenantExisting = await Review.query()
        .where('visit_request_id', visit.id)
        .where('user_id', visit.tenantId)
        .first()

      if (!tenantExisting) {
        await Review.create({
          visitRequestId: visit.id,
          propertyId: visit.propertyId,
          userId: visit.tenantId,
          rating: tenantSample.rating,
          comment: tenantSample.comment,
          reviewType: 'property',
        })
        created++
      }

      // Landlord review about tenant
      const landlordId = visit.property.user_id
      const landlordExisting = await Review.query()
        .where('visit_request_id', visit.id)
        .where('user_id', landlordId)
        .first()

      if (!landlordExisting) {
        await Review.create({
          visitRequestId: visit.id,
          propertyId: visit.propertyId,
          userId: landlordId,
          reviewedUserId: visit.tenantId,
          rating: landlordSample.rating,
          comment: landlordSample.comment,
          reviewType: 'tenant',
        })
        created++
      }
    }

    console.log(`✅ ${created} reviews created successfully.`)
  }
}
