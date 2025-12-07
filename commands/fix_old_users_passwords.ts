import { BaseCommand, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import User from '#models/user'
import hash from '@adonisjs/core/services/hash'

/**
 * Commande pour corriger les mots de passe des anciens utilisateurs
 * qui ont été créés avant le correctif du double hash
 */
export default class FixOldUsersPasswords extends BaseCommand {
  static commandName = 'fix:old-users-passwords'
  static description = 'Réinitialise les mots de passe des utilisateurs de test (seeder)'

  @flags.boolean({ alias: 'a', description: 'Réinitialiser tous les utilisateurs de test' })
  declare all: boolean

  @flags.string({ alias: 'p', description: 'Nouveau mot de passe pour tous les utilisateurs' })
  declare password: string

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    const db = (await import('@adonisjs/lucid/services/db')).default
    
    // Liste des emails des utilisateurs de test (du seeder)
    const testUsers = [
      'admin@example.com',
      'bailleur1@example.com',
      'bailleur2@example.com',
      'locataire1@example.com',
      'locataire2@example.com',
      'multi@example.com',
    ]

    if (!this.all) {
      this.logger.info('📋 Liste des utilisateurs de test disponibles:')
      testUsers.forEach((email, index) => {
        this.logger.info(`  ${index + 1}. ${email}`)
      })
      this.logger.info('')
      this.logger.info('💡 Pour réinitialiser tous les mots de passe, utilisez:')
      this.logger.info('   node ace fix:old-users-passwords --all --password="votre_mot_de_passe"')
      this.logger.info('')
      this.logger.info('💡 Pour réinitialiser un seul utilisateur, utilisez:')
      this.logger.info('   node ace reset:user-password email@example.com nouveau_mot_de_passe')
      return
    }

    if (!this.password) {
      this.logger.error('❌ Vous devez fournir un mot de passe avec --password')
      this.exitCode = 1
      return
    }

    this.logger.info(`🔐 Réinitialisation des mots de passe pour ${testUsers.length} utilisateurs de test...`)
    this.logger.info(`🔐 Nouveau mot de passe: ${this.password}`)
    this.logger.info('')

    // Hacher le nouveau mot de passe une seule fois
    const hashedPassword = await hash.use('scrypt').make(this.password)
    this.logger.info('✅ Hash créé')

    let successCount = 0
    let errorCount = 0

    for (const email of testUsers) {
      try {
        const normalizedEmail = email.trim().toLowerCase()
        const user = await User.findBy('email', normalizedEmail)

        if (!user) {
          this.logger.warn(`⚠️  Utilisateur non trouvé: ${email}`)
          errorCount++
          continue
        }

        // Mettre à jour directement avec SQL pour éviter le re-hash par withAuthFinder
        await db.from('users').where('id', user.id).update({ password: hashedPassword })

        this.logger.success(`✅ ${email} - Mot de passe réinitialisé`)
        successCount++
      } catch (error) {
        this.logger.error(`❌ ${email} - Erreur: ${error.message}`)
        errorCount++
      }
    }

    this.logger.info('')
    this.logger.info('📊 Résumé:')
    this.logger.info(`  ✅ Réussis: ${successCount}`)
    this.logger.info(`  ❌ Échecs: ${errorCount}`)
    this.logger.info('')
    this.logger.info(`🔐 Tous les utilisateurs de test ont maintenant le mot de passe: ${this.password}`)
  }
}
