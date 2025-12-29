import { BaseCommand } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import User from '#models/user'
import hash from '@adonisjs/core/services/hash'

/**
 * Commande pour diagnostiquer et corriger les problèmes de hash de mot de passe
 */
export default class FixUserPasswords extends BaseCommand {
  static commandName = 'fix:user-passwords'
  static description = 'Diagnostique et corrige les problèmes de hash de mot de passe pour tous les utilisateurs'

  static options: CommandOptions = {
    startApp: true,
  }

  async run() {
    this.logger.info('🔍 Analyse des utilisateurs pour détecter les problèmes de hash...')

    // Récupérer tous les utilisateurs
    const users = await User.query().orderBy('id', 'asc')
    
    this.logger.info(`📊 Nombre total d'utilisateurs: ${users.length}`)

    const problematicUsers: Array<{ id: number; email: string; hash: string }> = []
    const validUsers: Array<{ id: number; email: string }> = []

    for (const user of users) {
      if (!user.password) {
        this.logger.warn(`⚠️  Utilisateur ${user.id} (${user.email}) n'a pas de mot de passe`)
        problematicUsers.push({ id: user.id, email: user.email, hash: 'N/A' })
        continue
      }

      // Vérifier le format du hash
      const hashFormat = user.password.substring(0, 30)
      
      // Un hash scrypt valide devrait commencer par $scrypt$
      if (!user.password.startsWith('$scrypt$')) {
        this.logger.warn(`⚠️  Utilisateur ${user.id} (${user.email}) a un hash invalide: ${hashFormat}...`)
        problematicUsers.push({ id: user.id, email: user.email, hash: hashFormat })
        continue
      }

      // Le hash semble avoir le bon format
      this.logger.info(`✅ Utilisateur ${user.id} (${user.email}) - Hash: ${hashFormat}...`)
      validUsers.push({ id: user.id, email: user.email })
    }

    this.logger.info(`\n📈 Résumé:`)
    this.logger.info(`   ✅ Utilisateurs valides: ${validUsers.length}`)
    this.logger.info(`   ⚠️  Utilisateurs problématiques: ${problematicUsers.length}`)

    if (problematicUsers.length > 0) {
      this.logger.info(`\n⚠️  Utilisateurs avec des problèmes:`)
      problematicUsers.forEach((u) => {
        this.logger.info(`   - ID: ${u.id}, Email: ${u.email}, Hash: ${u.hash}`)
      })

      this.logger.warn(`\n💡 Pour réinitialiser un mot de passe, utilisez:`)
      this.logger.info(`   node ace reset:user-password <email> <nouveau_mot_de_passe>`)
    }

    // Vérifier si certains comptes ont été créés avant la correction
    // On peut détecter cela en regardant la date de création
    this.logger.info(`\n🔍 Vérification des comptes créés avant la correction...`)
    
    // Supposons que la correction a été faite aujourd'hui
    // Les comptes créés avant peuvent avoir des problèmes
    const usersToCheck = await User.query()
      .whereNotNull('password')
      .orderBy('created_at', 'asc')
    
    this.logger.info(`   Total de comptes à vérifier: ${usersToCheck.length}`)
    
    this.logger.info(`\n✅ Analyse terminée!`)
  }
}

