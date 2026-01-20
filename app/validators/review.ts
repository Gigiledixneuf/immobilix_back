import vine from '@vinejs/vine'

export const CreateReviewValidator = vine.compile(
  vine.object({
    visit_request_id: vine
      .string()
      .trim()
      .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
    rating: vine.number().min(1).max(5),
    comment: vine.string().trim().maxLength(2000).optional(),
  })
)
