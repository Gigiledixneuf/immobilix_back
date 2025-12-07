import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import User from '#models/user'
import hash from '@adonisjs/core/services/hash'

export default class ResetUserPassword extends BaseCommand {
  static commandName = 'reset:user-password'
  static description = 'Réinitialise le mot de passe d\'un utilisateur'

  @args.string({ description: 'Email de l\'utilisateur' })
  declare email: string

  @args.string({ description: 'Nouveau mot de passe' })
  declare newPassword: string

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const normalizedEmail = this.email.trim().toLowerCase()
    
    this.logger.info(`🔐 Recherche de l'utilisateur avec l'email: ${normalizedEmail}`)
    
    const user = await User.findBy('email', normalizedEmail)
    
    if (!user) {
      this.logger.error(`❌ Utilisateur non trouvé avec l'email: ${normalizedEmail}`)
      this.exitCode = 1
      return
    }

    this.logger.info(`✅ Utilisateur trouvé - ID: ${user.id}, Email: ${user.email}`)

            // Hacher le nouveau mot de passe
            this.logger.info('🔐 Hachage du nouveau mot de passe...')
            const hashedPassword = await hash.use('scrypt').make(this.newPassword)
            
            // Mettre à jour le mot de passe directement avec SQL pour éviter le re-hash par withAuthFinder
            const db = (await import('@adonisjs/lucid/services/db')).default
            await db.from('users').where('id', user.id).update({ password: hashedPassword })
            await user.refresh()

    this.logger.success(`✅ Mot de passe réinitialisé avec succès pour ${normalizedEmail}`)
    this.logger.info(`📝 Nouveau mot de passe: ${this.newPassword}`)
  }
}
