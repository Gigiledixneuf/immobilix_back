// database/seeders/DatabaseSeeder.ts

import { BaseSeeder } from '@adonisjs/lucid/seeders'
import RoleSeeder from '#database/seeders/role_seeder'
import UserSeeder from '#database/seeders/user_seeder'
import PropertySeeder from '#database/seeders/property_seeder'
import ContractSeeder from '#database/seeders/contract_seeder'
import ReviewSeeder from '#database/seeders/review_seeder'

export default class DatabaseSeeder extends BaseSeeder {
  private async runSeeder(Seeder: typeof BaseSeeder) {
    try {
      console.log(`🌱 Exécution du seeder: ${Seeder.name}`)

      // ⚡ Méthode recommandée pour exécuter les seeders
      await new Seeder(this.client).run()

      console.log(`✅ ${Seeder.name} terminé avec succès`)
    } catch (error) {
      console.error(`❌ Erreur lors de l'exécution de ${Seeder.name}:`, error)
      throw error // Arrêter l'exécution en cas d'erreur critique
    }
  }

  public async run() {
    console.log('🚀 Starting main database seeder...')

    // ⚡ Exécution dans l'ordre correct avec gestion des dépendances
    await this.runSeeder(RoleSeeder) // 1. Les rôles d'abord
    await this.runSeeder(UserSeeder) // 2. Puis les utilisateurs (dépend des rôles)
    await this.runSeeder(PropertySeeder) // 3. Ensuite les propriétés (dépend des utilisateurs)
    await this.runSeeder(ContractSeeder) // 4. Enfin les contrats (dépend des utilisateurs et propriétés)
    await this.runSeeder(ReviewSeeder) // 5. Avis sur les propriétés

    console.log('🎉 Database seeding completed!')
  }
}
