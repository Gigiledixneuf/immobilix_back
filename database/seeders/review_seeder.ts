import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Review from '#models/review'
import Property from '#models/property'
import User from '#models/user'
import Role from '#models/role'
import { ModelQueryBuilderContract } from '@adonisjs/lucid/types/model'

export default class ReviewSeeder extends BaseSeeder {
  public async run() {
    console.log('🌱 Seeding reviews...')

    const properties = await Property.query()
    const tenants = await User.query().whereHas(
      'roles',
      (roleQuery: ModelQueryBuilderContract<typeof Role>) => {
        roleQuery.where('name', 'locataire')
      }
    )

    if (properties.length === 0 || tenants.length === 0) {
      console.warn('⚠️ Not enough properties or tenants. Run previous seeders first.')
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
    const maxReviewsPerProperty = Math.min(3, tenants.length, reviewSamples.length)

    for (const property of properties) {
      const offset = property.id % tenants.length

      for (let i = 0; i < maxReviewsPerProperty; i++) {
        const tenant = tenants[(offset + i) % tenants.length]
        const sample = reviewSamples[(property.id + i) % reviewSamples.length]

        const existing = await Review.query()
          .where('property_id', property.id)
          .where('user_id', tenant.id)
          .first()

        if (existing) {
          continue
        }

        await Review.create({
          propertyId: property.id,
          userId: tenant.id,
          rating: sample.rating,
          comment: sample.comment,
        })

        created++
      }
    }

    console.log(`✅ ${created} reviews created successfully.`)
  }
}
