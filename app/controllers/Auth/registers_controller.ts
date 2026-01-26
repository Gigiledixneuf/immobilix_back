import type { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import User from '#models/user'
import Role from '#models/role'
import hash from '@adonisjs/core/services/hash'
import { RegisterValidator } from '#validators/Auth/register'
import { DateTime } from 'luxon'

export default class RegistersController {
  async register({ request, response }: HttpContext) {
    const data = await request.validateUsing(RegisterValidator)

    try {
      // Hash du mot de passe
      const hashedPassword = await hash.use('scrypt').make(data.password)

      // Création de l'utilisateur
      // IMPORTANT: withAuthFinder peut re-hasher le password même s'il est déjà hashé
      const derivedFullName = data.full_name ?? `${data.first_name} ${data.last_name}`.trim()
      const user = await User.create({
        fullName: derivedFullName,
        firstName: data.first_name,
        lastName: data.last_name,
        gender: data.gender ?? null,
        dateOfBirth: data.date_of_birth ? DateTime.fromJSDate(data.date_of_birth) : null,
        email: data.email.trim().toLowerCase(),
        portable: data.portable,
        password: hashedPassword,
      })
      
      // Vérifier si le hash a été modifié par withAuthFinder et le corriger si nécessaire
      await user.refresh()
      if (user.password !== hashedPassword) {
        // Mettre à jour directement avec une requête SQL pour éviter le re-hash
        const db = (await import('@adonisjs/lucid/services/db')).default
        await db.from('users').where('id', user.id).update({ password: hashedPassword })
        await user.refresh()
      }

      //Attribution des rôles
      const roleNames = data.roles && data.roles.length > 0 ? data.roles : ['locataire']
      const roles = await Role.query().whereIn('name', roleNames)

      if (roles.length > 0) {
        // @ts-ignore
        await user.related('roles').attach(roles.map((r) => r.id))
      }

      // Charger les rôles pour la réponse
      await user.load('roles')

      // 🔑 Génération du token
      const token = await User.accessTokens.create(user)

      // ✅ Réponse structurée
      return response.created({
        status: 'success',
        message: 'Inscription réussie',
        data: {
          user: user.serialize({
            fields: { omit: ['password'] },
            relations: { roles: { fields: ['id', 'name'] } },
          }),
          token: token.value!.release(),
        },
      })
    } catch (error) {
      logger.error('Register error:', error)
      return response.internalServerError({
        status: 'error',
        message: 'Inscription échouée',
        error: error.message,
      })
    }
  }
}
