import type { HttpContext } from '@adonisjs/core/http'
import { CreateInviteValidator } from '#validators/invites'
import Invite, { InviteStatus } from '#models/invite'
import Property from '#models/property'
import NotificationsService from '#services/notifications_service'
import { ensureUuid } from '#utils/uuid'

function generateCode(length = 8): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let out = ''
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

export default class InvitesController {
  /**
   * POST /api/invites
   * Le bailleur envoie une invitation à un locataire (email/téléphone), optionnellement liée à un logement.
   */
  async store({ request, auth, response }: HttpContext) {
    const user = auth.user
    if (!user) return response.unauthorized({ message: 'Non authentifié' })

    // ISOLATION STRICTE : Seuls les utilisateurs en mode BAILLEUR peuvent envoyer des invitations
    if (user.activeRole !== 'landlord') {
      return response.forbidden({
        message: 'Vous devez être en mode BAILLEUR pour envoyer une invitation. Changez de rôle dans votre profil.',
      })
    }

    const payload = await request.validateUsing(CreateInviteValidator)

    let resolvedPropertyId: number | null = null
    let resolvedPropertyUuid: string | null = null
    if (payload.propertyId) {
      ensureUuid(payload.propertyId, 'UUID de propriété invalide')
      const property = await Property.findBy('uuid', payload.propertyId)
      if (!property) return response.notFound({ message: 'Logement introuvable' })
      if (property.user_id !== user.id) {
        return response.forbidden({ message: "Vous n'êtes pas propriétaire de ce logement" })
      }
      resolvedPropertyId = property.id
      resolvedPropertyUuid = property.uuid
    }

    const code = generateCode()

    const invite = await Invite.create({
      landlordId: user.id,
      propertyId: resolvedPropertyId,
      contact: payload.contact,
      code,
      status: InviteStatus.PENDING,
    })

    const notifier = new NotificationsService()
    await notifier.notifyContact(
      payload.contact,
      'Invitation ImmobiliX',
      `Vous avez été invité à rejoindre ImmobiliX. Code: ${code}`,
      {
      propertyId: resolvedPropertyUuid ?? undefined,
      code,
    })

    return response.created({ message: 'Invitation créée', data: invite })
  }
}


