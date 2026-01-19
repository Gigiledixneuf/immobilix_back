import vine from '@vinejs/vine'
import { DateTime } from 'luxon'

const minimumAgeRule = vine.createRule((value, _, field) => {
  const date = value instanceof Date ? DateTime.fromJSDate(value) : DateTime.fromISO(String(value))
  if (!date.isValid) {
    return
  }

  const age = Math.floor(DateTime.utc().diff(date, 'years').years)
  if (age < 18) {
    field.report('Vous devez avoir au moins 18 ans pour vous inscrire', 'age', field)
  }
})

/**
 * Validation pour l'inscription d'un utilisateur
 */
export const RegisterValidator = vine.compile(
  vine.object({
    first_name: vine.string().trim().maxLength(100).minLength(2),
    last_name: vine.string().trim().maxLength(100).minLength(1),
    gender: vine.enum(['male', 'female']),
    date_of_birth: vine.date().use(minimumAgeRule),
    full_name: vine.string().trim().maxLength(80).minLength(3).optional(),
    email: vine.string().trim().email().unique({ table: 'users', column: 'email' }),
    portable: vine.string().regex(/^[0-9+]{8,15}$/),
    password: vine.string().trim().minLength(8).confirmed(),
    roles: vine.array(vine.enum(['bailleur', 'locataire', 'admin'])).optional(),
  })
)
