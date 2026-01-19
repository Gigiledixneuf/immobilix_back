import { BaseSeeder } from '@adonisjs/lucid/seeders'
import Role from '#models/role'
import User from '#models/user'
import hash from '@adonisjs/core/services/hash'

export default class UserSeeder extends BaseSeeder {
  async run() {
    // Write your database queries inside the run method
    console.log('🌱 Seeding test users...')

    // --- 1️⃣ Récupération des rôles déjà existants
    const roles = await Role.query()
    const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]))

    if (!roleMap.admin || !roleMap.bailleur || !roleMap.locataire) {
      console.warn('⚠️ Certains rôles manquent. Exécute d’abord le RoleSeeder.')
      return
    }

    // --- 2️⃣ Fonction utilitaire pour créer un utilisateur + hash mot de passe
    const createUser = async (
      firstName: string,
      lastName: string,
      gender: 'male' | 'female',
      dateOfBirth: string,
      email: string,
      portable: string,
      plainPassword: string
    ) => {
      const existing = await User.query().where('email', email).first()
      if (existing) {
        return existing
      }

      const hashedPassword = await hash.use('scrypt').make(plainPassword)
      const user = await User.create({
        fullName: `${firstName} ${lastName}`.trim(),
        firstName,
        lastName,
        gender,
        dateOfBirth,
        email,
        portable,
        password: hashedPassword,
      })

      // IMPORTANT: withAuthFinder peut re-hasher le password
      // Vérifier si le hash a été modifié et le corriger si nécessaire
      await user.refresh()
      if (user.password !== hashedPassword) {
        // Mettre à jour directement avec une requête SQL pour éviter le re-hash
        const db = (await import('@adonisjs/lucid/services/db')).default
        await db.from('users').where('id', user.id).update({ password: hashedPassword })
        await user.refresh()
      }

      return user
    }

    // --- 3️⃣ Création des utilisateurs

    // 👑 Admin
    const admin = await createUser('Admin', 'User', 'male', '1990-01-01', 'admin@example.com', '0600000000', 'password123')
    // @ts-ignore
    await admin.related('roles').sync([roleMap.admin], false)

    // 🧑‍💼 Bailleur1
    const bailleur1 = await createUser(
      'Well',
      'Monga',
      'male',
      '1991-05-12',
      'bailleur1@example.com',
      '0611111111',
      'password'
    )
    // @ts-ignore
    await bailleur1.related('roles').sync([roleMap.bailleur], false)

    // 🧑‍💼 Bailleur2
    const bailleur2 = await createUser(
      'Adeline',
      'Kayeya',
      'female',
      '1992-03-08',
      'bailleur2@example.com',
      '0611111111',
      'password'
    )
    // @ts-ignore
    await bailleur2.related('roles').sync([roleMap.bailleur], false)

    // 👩‍💻 Locataire
    const locataire = await createUser(
      'Zoukou',
      'Mayzeee',
      'female',
      '1998-07-15',
      'locataire1@example.com',
      '0622222222',
      'password'
    )
    // @ts-ignore
    await locataire.related('roles').sync([roleMap.locataire], false)

    const locataire2 = await createUser(
      'Kaki',
      'Santana',
      'male',
      '1995-11-21',
      'locataire2@example.com',
      '0622222222',
      'password'
    )
    // @ts-ignore
    await locataire2.related('roles').sync([roleMap.locataire], false)

    // 👥 User mixte (bailleur + locataire)
    const multi = await createUser(
      'Thomas',
      'Koffi',
      'male',
      '1993-04-02',
      'multi@example.com',
      '0633333333',
      'password'
    )
    // @ts-ignore
    await multi.related('roles').sync([roleMap.bailleur, roleMap.locataire], false)

    console.log('✅ Users seeded successfully.')
  }
}
