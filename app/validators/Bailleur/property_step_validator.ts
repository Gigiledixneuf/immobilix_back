import vine from '@vinejs/vine'

/**
 * Validateur pour l'étape 1 : Adresse de la propriété
 */
export const Step1AddressValidator = vine.compile(
  vine.object({
    address: vine.string().trim().minLength(5),
    street_number: vine.string().trim().minLength(1).optional(),
    city: vine.string().trim().minLength(2),
    state: vine.string().trim().minLength(2),
    postal_code: vine.string().trim().minLength(4).optional(),
    latitude: vine.number().min(-90).max(90).optional(),
    longitude: vine.number().min(-180).max(180).optional(),
    formatted_address: vine.string().trim().minLength(5).optional(),
  })
)

/**
 * Validateur pour l'étape 2 : Disponibilité
 */
export const Step2AvailabilityValidator = vine.compile(
  vine.object({
    available_from: vine.date({ formats: ['YYYY-MM-DD', 'YYYY-MM-DD HH:mm:ss'] }),
    available_time: vine.string().trim().optional(),
  })
)

/**
 * Validateur pour l'étape 3 : Quand voulez-vous louer ?
 */
export const Step3RentalTimingValidator = vine.compile(
  vine.object({
    rental_timing: vine.enum([
      'within_3_days',
      'within_1_week',
      'within_1_month',
      'within_2_months',
      'more_than_2_months',
      'not_sure',
    ]),
  })
)

/**
 * Validateur pour l'étape 4 : Raison de la location
 */
export const Step4RentalReasonValidator = vine.compile(
  vine.object({
    rental_reason: vine.enum(['upgrade', 'secondary_house', 'relocation', 'reduce_spending', 'budget', 'other']),
    rental_reason_other: vine.string().trim().optional(),
  })
)

/**
 * Validateur pour l'étape 5 : Description
 */
export const Step5DescriptionValidator = vine.compile(
  vine.object({
    description: vine.string().trim().minLength(10).optional(),
  })
)

/**
 * Validateur pour l'étape 6 : Caractéristiques du logement
 */
export const Step6PropertyFactsValidator = vine.compile(
  vine.object({
    type: vine.enum(['house', 'apartment', 'studio', 'room']),
    property_use_type: vine.enum(['residential', 'commercial']),
    surface: vine.number().positive(),
    land_size: vine.number().positive().optional(),
    year_built: vine.number().positive().optional(),
    rooms: vine.number().positive(),
    bathrooms: vine.number().positive(),
    security_deposit: vine.number().positive(),
    deposit_months: vine.number().positive(),
    price: vine.number().positive(),
  })
)

/**
 * Validateur pour l'étape 7 : Contact
 */
export const Step7ContactValidator = vine.compile(
  vine.object({
    contact_phone: vine.string().trim().minLength(8),
    additional_info: vine.string().trim().optional(),
  })
)

/**
 * Validateur pour l'étape 8 : Photos et commodités
 * Sécurité : 5MB max par image, min 4 images, max 20 images
 */
export const Step8PhotosAmenitiesValidator = vine.compile(
  vine.object({
    photos: vine
      .array(
        vine.file({
          size: '5mb', // Limite de 5MB par image
          extnames: ['jpg', 'jpeg', 'png', 'webp'], // Extensions autorisées
        })
      )
      .minLength(4, 'Vous devez fournir au moins 4 photos') // Minimum 4 images
      .maxLength(20, 'Vous ne pouvez pas uploader plus de 20 photos'), // Maximum 20 images
    // Accepter amenities comme tableau ou string JSON
    // On utilise any() pour accepter n'importe quel type, puis on transforme
    amenities: vine
      .any()
      .optional()
      .transform((value) => {
        // Si c'est déjà un tableau, le retourner tel quel
        if (Array.isArray(value)) {
          return value.map((item) => typeof item === 'string' ? item.trim() : String(item))
        }
        // Si c'est une string, essayer de la parser comme JSON
        if (typeof value === 'string' && value.trim()) {
          try {
            const parsed = JSON.parse(value)
            if (Array.isArray(parsed)) {
              return parsed.map((item) => typeof item === 'string' ? item.trim() : String(item))
            }
            return []
          } catch {
            return []
          }
        }
        return []
      }),
  })
)

/**
 * Validateur pour la création complète (toutes les étapes)
 */
export const CompletePropertyValidator = vine.compile(
  vine.object({
    // Étape 1
    address: vine.string().trim().minLength(5),
    street_number: vine.string().trim().minLength(1).optional(),
    city: vine.string().trim().minLength(2),
    state: vine.string().trim().minLength(2),
    postal_code: vine.string().trim().minLength(4).optional(),
    latitude: vine.number().min(-90).max(90).optional(),
    longitude: vine.number().min(-180).max(180).optional(),
    formatted_address: vine.string().trim().minLength(5).optional(),

    // Étape 2
    available_from: vine.date({ formats: ['YYYY-MM-DD', 'YYYY-MM-DD HH:mm:ss'] }),
    available_time: vine.string().trim().optional(),

    // Étape 3
    rental_timing: vine.enum([
      'within_3_days',
      'within_1_week',
      'within_1_month',
      'within_2_months',
      'more_than_2_months',
      'not_sure',
    ]),

    // Étape 4
    rental_reason: vine.enum(['upgrade', 'secondary_house', 'relocation', 'reduce_spending', 'budget', 'other']),
    rental_reason_other: vine.string().trim().optional(),

    // Étape 5
    description: vine.string().trim().minLength(10).optional(),

    // Étape 6
    type: vine.enum(['house', 'apartment', 'studio', 'room']),
    property_use_type: vine.enum(['residential', 'commercial']),
    surface: vine.number().positive(),
    land_size: vine.number().positive().optional(),
    year_built: vine.number().positive().optional(),
    rooms: vine.number().positive(),
    bathrooms: vine.number().positive(),
    security_deposit: vine.number().positive(),
    deposit_months: vine.number().positive(),
    price: vine.number().positive(),

    // Étape 7
    contact_phone: vine.string().trim().minLength(8),
    additional_info: vine.string().trim().optional(),

    // Étape 8
    photos: vine
      .array(
        vine.file({
          size: '5mb', // Limite de 5MB par image
          extnames: ['jpg', 'jpeg', 'png', 'webp'], // Extensions autorisées
        })
      )
      .minLength(4, 'Vous devez fournir au moins 4 photos') // Minimum 4 images
      .maxLength(20, 'Vous ne pouvez pas uploader plus de 20 photos'), // Maximum 20 images
    amenities: vine.array(vine.string().trim()).optional(),

    // Nom de la propriété (généré ou fourni)
    name: vine.string().trim().minLength(3).maxLength(80).optional(),
  })
)

