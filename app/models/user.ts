import { DateTime } from 'luxon'
import hash from '@adonisjs/core/services/hash'
import { compose } from '@adonisjs/core/helpers'
import { BaseModel, column, hasMany, manyToMany } from '@adonisjs/lucid/orm'
import { withAuthFinder } from '@adonisjs/auth/mixins/lucid'
import { DbAccessTokensProvider } from '@adonisjs/auth/access_tokens'
import Role from '#models/role'
import type { HasMany, ManyToMany } from '@adonisjs/lucid/types/relations'
import Property from '#models/property'
import Contract from '#models/contract'
import FcmToken from '#models/fcm_token'

const AuthFinder = withAuthFinder(() => hash.use('scrypt'), {
  uids: ['email'],
  passwordColumnName: 'password',
})

export default class User extends compose(BaseModel, AuthFinder) {
  @column({ isPrimary: true })
  declare id: number

  @column()
  declare fullName: string | null

  @column()
  declare email: string

  @column()
  declare portable: string

  @column()
  declare profilePhotoUrl: string | null

  @column({ serializeAs: null })
  declare password: string

  /**
   * Score de fiabilité : +10 visite complétée, -20 no-show, -5 annulation tardive
   */
  @column()
  declare reliabilityScore: number

  /**
   * Rôle actif de l'utilisateur : 'tenant' ou 'landlord'
   * Détermine quelles données l'utilisateur peut voir et quelles actions il peut effectuer
   */
  @column()
  declare activeRole: 'tenant' | 'landlord' | null

  /**
   * Rôle par défaut lors de la première connexion
   */
  @column()
  declare defaultRole: string | null

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @manyToMany(() => Role, {
    pivotTable: 'user_roles',
  })
  declare roles: ManyToMany<typeof Role>

  @hasMany(() => Property)
  declare Property: HasMany<typeof Property>

  @hasMany(() => Contract, { foreignKey: 'id_tenant' })
  declare contracts: HasMany<typeof Contract>

  @hasMany(() => FcmToken)
  declare fcmTokens: HasMany<typeof FcmToken>

  static accessTokens = DbAccessTokensProvider.forModel(User)
}
