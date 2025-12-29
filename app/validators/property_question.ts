import vine from '@vinejs/vine'

export const CreatePropertyQuestionValidator = vine.compile(
  vine.object({
    question: vine.string().trim().minLength(10).maxLength(1000),
  })
)

export const AnswerPropertyQuestionValidator = vine.compile(
  vine.object({
    answer: vine.string().trim().minLength(5).maxLength(1000),
  })
)




