import vine from '@vinejs/vine'

export const fcmTokenValidator = vine.compile(
  vine.object({
    token: vine.string().minLength(1),
    deviceId: vine.string().optional(),
    deviceType: vine.string().in(['ios', 'android']).optional(),
  })
)

