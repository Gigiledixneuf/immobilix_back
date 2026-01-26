import vine from '@vinejs/vine'
import { DateTime } from 'luxon'

/** Date max (il y a 18 ans) au format YYYY-MM-DD pour la règle beforeOrEqual */
const maxBirthDateFor18 = DateTime.utc().minus({ years: 18 }).toISODate()!

/**
 * Validation pour l'inscription d'un utilisateur
 */
export const RegisterValidator = vine.compile(
  vine.object({
    first_name: vine.string().trim().maxLength(100).minLength(2),
    last_name: vine.string().trim().maxLength(100).minLength(1),
    gender: vine.enum(['male', 'female']).optional(),
    date_of_birth: vine.date().beforeOrEqual(maxBirthDateFor18).optional(),
    full_name: vine.string().trim().maxLength(80).minLength(3).optional(),
    email: vine.string().trim().email().unique({ table: 'users', column: 'email' }),
    portable: vine.string().regex(/^[0-9+]{8,15}$/),
    password: vine.string().trim().minLength(8).confirmed(),
    roles: vine.array(vine.enum(['bailleur', 'locataire', 'admin'])).optional(),
  })
)
