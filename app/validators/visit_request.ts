import vine from '@vinejs/vine'

export const CreateVisitRequestValidator = vine.compile(
  vine.object({
    requested_date: vine.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    requested_time: vine.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    message: vine.string().trim().optional(),
  })
)

export const UpdateVisitRequestStatusValidator = vine.compile(
  vine.object({
    status: vine.enum(['accepted', 'rejected', 'cancelled']),
    scheduled_at: vine.date().optional(), // Date/heure confirmée si acceptée
  })
)

export const CompleteVisitValidator = vine.compile(
  vine.object({
    confirmed_by: vine.enum(['landlord', 'tenant']),
    notes: vine.string().trim().optional(),
  })
)

export const CreateApplicationFromVisitValidator = vine.compile(
  vine.object({
    message: vine.string().trim().optional(),
  })
)