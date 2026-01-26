import vine from '@vinejs/vine'
import { DateTime } from 'luxon'
import { uniqueRule } from '#validators/rules/unique'

const maxBirthDateFor18 = DateTime.utc().minus({ years: 18 }).toISODate()!

export const UpdateProfileValidator = vine.compile(
  vine.object({
    fullName: vine.string().maxLength(255).optional(),
    firstName: vine.string().maxLength(100).optional(),
    lastName: vine.string().maxLength(100).optional(),
    profilePhoto: vine.string().maxLength(255).optional(),
    email: vine
      .string()
      .email()
      .use(
        uniqueRule({
          table: 'users',
          column: 'email',
          except: (field: any) => field.meta?.userId,
        })
      )
      .optional(),
    password: vine.string().minLength(8).confirmed().optional(),
    gender: vine.enum(['male', 'female']).optional(),
    dateOfBirth: vine.date().beforeOrEqual(maxBirthDateFor18).optional(),
  })
)
