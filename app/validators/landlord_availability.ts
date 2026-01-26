import vine from '@vinejs/vine'

/**
 * Validateur pour la création/mise à jour d'une disponibilité de bailleur
 */
export const CreateLandlordAvailabilityValidator = vine.compile(
  vine.object({
    available_days: vine
      .array(
        vine.enum([
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday',
          'sunday',
        ])
      )
      .minLength(1),

    start_time: vine
      .string()
      .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),

    end_time: vine
      .string()
      .regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),

    visit_duration_minutes: vine.number().min(15).max(120).optional(),
  })
)

export const CreateLandlordAvailabilityMessages = {
  'available_days.required': 'Les jours de disponibilité sont obligatoires',
  'available_days.array': 'Le format des jours est invalide',
  'available_days.minLength': 'Au moins un jour de disponibilité est requis',

  'available_days.*.enum':
    'Jour invalide (monday à sunday uniquement)',

  'start_time.required':
    "L'heure de début est obligatoire",
  'start_time.regex':
    "L'heure de début doit être au format HH:mm (ex: 08:00)",

  'end_time.required':
    "L'heure de fin est obligatoire",
  'end_time.regex':
    "L'heure de fin doit être au format HH:mm (ex: 17:00)",

  'visit_duration_minutes.number':
    'La durée de visite doit être un nombre',
  'visit_duration_minutes.min':
    'La durée minimale est de 15 minutes',
  'visit_duration_minutes.max':
    'La durée maximale est de 120 minutes',
}


