import vine from '@vinejs/vine'

export const AddressGeocodeValidator = vine.compile(
  vine.object({
    query: vine.string().trim().minLength(3),
    limit: vine.number().min(1).max(10).optional(),
  })
)

export const CoordinatesGeocodeValidator = vine.compile(
  vine.object({
    latitude: vine.number().min(-90).max(90),
    longitude: vine.number().min(-180).max(180),
  })
)
