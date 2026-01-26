import { BaseSchema } from '@adonisjs/lucid/schema'

type UserReference = {
  table: string
  column: string
  nullable: boolean
  onDelete: 'CASCADE' | 'SET NULL'
}

export default class extends BaseSchema {
  protected userReferences: UserReference[] = [
    { table: 'user_roles', column: 'user_id', nullable: false, onDelete: 'CASCADE' },
    { table: 'auth_access_tokens', column: 'tokenable_id', nullable: false, onDelete: 'CASCADE' },
    { table: 'properties', column: 'user_id', nullable: false, onDelete: 'CASCADE' },
    { table: 'contracts', column: 'tenant_id', nullable: false, onDelete: 'CASCADE' },
    { table: 'contracts', column: 'user_id', nullable: true, onDelete: 'CASCADE' },
    { table: 'applications', column: 'tenant_id', nullable: false, onDelete: 'CASCADE' },
    { table: 'notifications', column: 'user_id', nullable: false, onDelete: 'CASCADE' },
    { table: 'invites', column: 'landlord_id', nullable: false, onDelete: 'CASCADE' },
    { table: 'reviews', column: 'user_id', nullable: false, onDelete: 'CASCADE' },
    { table: 'visit_requests', column: 'tenant_id', nullable: false, onDelete: 'CASCADE' },
    { table: 'fcm_tokens', column: 'user_id', nullable: false, onDelete: 'CASCADE' },
    { table: 'landlord_availabilities', column: 'landlord_id', nullable: false, onDelete: 'CASCADE' },
    { table: 'favorites', column: 'user_id', nullable: false, onDelete: 'CASCADE' },
    { table: 'property_views', column: 'user_id', nullable: false, onDelete: 'CASCADE' },
    { table: 'property_questions', column: 'user_id', nullable: false, onDelete: 'CASCADE' },
    { table: 'login_attempts', column: 'user_id', nullable: true, onDelete: 'SET NULL' },
    { table: 'password_reset_tokens', column: 'user_id', nullable: false, onDelete: 'CASCADE' },
  ]

  private async getForeignKeyName(table: string, column: string): Promise<string | null> {
    const fkResult: any = await this.db.rawQuery(
      `
      SELECT CONSTRAINT_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND COLUMN_NAME = ?
      AND REFERENCED_TABLE_NAME IS NOT NULL
    `,
      [table, column]
    )

    const rows = fkResult[0] || []
    return rows.length > 0 ? rows[0].CONSTRAINT_NAME : null
  }

  private async getColumn(table: string, column: string): Promise<any | null> {
    const result: any = await this.db.rawQuery(`SHOW COLUMNS FROM ${table}`)
    const columns = result[0] || []
    return columns.find((col: any) => col.Field === column) ?? null
  }

  private async hasColumn(table: string, column: string): Promise<boolean> {
    return (await this.getColumn(table, column)) !== null
  }

  private async getPrimaryKeyColumns(table: string): Promise<string[]> {
    const result: any = await this.db.rawQuery(
      `
      SELECT COLUMN_NAME
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = ?
      AND CONSTRAINT_NAME = 'PRIMARY'
      ORDER BY ORDINAL_POSITION
    `,
      [table]
    )
    const rows = result[0] || []
    return rows.map((row: any) => row.COLUMN_NAME)
  }

  async up() {
    // Deprecated: replaced by public UUID strategy (keep INT PKs).
    // Intentionally no-op to avoid swapping primary keys.
    return
    await this.schema.raw('SET FOREIGN_KEY_CHECKS = 0')

    const usersHasUuid = await this.hasColumn('users', 'uuid')
    if (!usersHasUuid) {
      await this.schema.raw(`ALTER TABLE users ADD COLUMN uuid CHAR(36) NULL`)
    }
    await this.schema.raw(`UPDATE users SET uuid = UUID() WHERE uuid IS NULL`)

    const usersHasLegacyId = await this.hasColumn('users', 'legacy_id')

    for (const ref of this.userReferences) {
      const hasUuidColumn = await this.hasColumn(ref.table, `${ref.column}_uuid`)
      if (!hasUuidColumn) {
        await this.schema.raw(
          `ALTER TABLE ${ref.table} ADD COLUMN ${ref.column}_uuid CHAR(36) ${
            ref.nullable ? 'NULL' : 'NOT NULL'
          }`
        )
      }

      const hasLegacyColumn = await this.hasColumn(ref.table, ref.column)
      if (hasLegacyColumn) {
        const refColumn = await this.getColumn(ref.table, ref.column)
        const refType = String(refColumn?.Type || '').toLowerCase()
        const refIsString = refType.includes('char') || refType.includes('varchar')

        const joinColumn = usersHasLegacyId && !refIsString ? 'legacy_id' : 'id'
        const joinColumnInfo = await this.getColumn('users', joinColumn)
        const joinType = String(joinColumnInfo?.Type || '').toLowerCase()
        const joinIsString = joinType.includes('char') || joinType.includes('varchar')

        const onClause =
          refIsString || joinIsString
            ? `BINARY t.${ref.column} = BINARY u.${joinColumn}`
            : `t.${ref.column} = u.${joinColumn}`

        await this.schema.raw(
          `UPDATE ${ref.table} t INNER JOIN users u ON ${onClause} SET t.${ref.column}_uuid = u.uuid`
        )
      }

      const fkName = await this.getForeignKeyName(ref.table, ref.column)
      if (fkName) {
        await this.schema.raw(`ALTER TABLE ${ref.table} DROP FOREIGN KEY ${fkName}`)
      }
    }

    try {
      await this.schema.raw(`ALTER TABLE user_roles DROP PRIMARY KEY`)
    } catch {
      // Ignore if already dropped
    }

    for (const ref of this.userReferences) {
      const uuidColumn = await this.getColumn(ref.table, `${ref.column}_uuid`)
      const legacyColumn = await this.getColumn(ref.table, ref.column)

      if (uuidColumn && legacyColumn) {
        const legacyType = String(legacyColumn.Type || '').toLowerCase()
        const isLegacyUuid =
          legacyType.includes('char(36)') || legacyType.includes('varchar(36)')
        if (isLegacyUuid) {
          // Legacy column already migrated, drop leftover uuid column if exists
          try {
            await this.schema.raw(`ALTER TABLE ${ref.table} DROP COLUMN ${ref.column}_uuid`)
          } catch {
            // Ignore if already dropped
          }
          continue
        }

        const legacyTemp = `${ref.column}_legacy_int`
        try {
          if (!(await this.hasColumn(ref.table, legacyTemp))) {
            await this.schema.raw(`ALTER TABLE ${ref.table} CHANGE COLUMN ${ref.column} ${legacyTemp} INT UNSIGNED ${
              ref.nullable ? 'NULL' : 'NOT NULL'
            }`)
          }
        } catch {
          // Ignore if rename fails
        }
        await this.schema.raw(
          `ALTER TABLE ${ref.table} CHANGE COLUMN ${ref.column}_uuid ${ref.column} CHAR(36) ${
            ref.nullable ? 'NULL' : 'NOT NULL'
          }`
        )
        try {
          await this.schema.raw(`ALTER TABLE ${ref.table} DROP COLUMN ${legacyTemp}`)
        } catch {
          // Ignore if already dropped
        }
        continue
      }

      if (uuidColumn && !legacyColumn) {
        const stillHasLegacy = await this.hasColumn(ref.table, ref.column)
        if (stillHasLegacy) {
          try {
            await this.schema.raw(`ALTER TABLE ${ref.table} DROP COLUMN ${ref.column}_uuid`)
          } catch {
            // Ignore if already dropped
          }
          continue
        }
        await this.schema.raw(
          `ALTER TABLE ${ref.table} CHANGE COLUMN ${ref.column}_uuid ${ref.column} CHAR(36) ${
            ref.nullable ? 'NULL' : 'NOT NULL'
          }`
        )
      }
    }

    const hasUuidColumn = await this.hasColumn('users', 'uuid')
    if (hasUuidColumn) {
      const idColumn = await this.getColumn('users', 'id')
      const idType = String(idColumn?.Type || '').toLowerCase()
      const idIsUuid = idType.includes('char(36)') || idType.includes('varchar(36)')
      const legacyExists = await this.hasColumn('users', 'legacy_id')

      if (idIsUuid) {
        // UUID already swapped into id, drop leftover uuid column if present
        try {
          await this.schema.raw(`ALTER TABLE users DROP COLUMN uuid`)
        } catch {
          // Ignore if already dropped
        }
      } else {
        try {
          await this.schema.raw(`ALTER TABLE users DROP PRIMARY KEY`)
        } catch {
          // Ignore if already dropped
        }

        if (!legacyExists) {
          await this.schema.raw(`ALTER TABLE users CHANGE COLUMN id legacy_id INT UNSIGNED NULL`)
        } else {
          const legacyTemp = await this.hasColumn('users', 'id_legacy_int')
          if (!legacyTemp) {
            await this.schema.raw(`ALTER TABLE users CHANGE COLUMN id id_legacy_int INT UNSIGNED NULL`)
          }
        }

        await this.schema.raw(`ALTER TABLE users CHANGE COLUMN uuid id CHAR(36) NOT NULL`)

        if (legacyExists) {
          try {
            await this.schema.raw(`ALTER TABLE users DROP COLUMN id_legacy_int`)
          } catch {
            // Ignore if already dropped
          }
        }
      }

      const pkColumns = await this.getPrimaryKeyColumns('users')
      if (!(pkColumns.length === 1 && pkColumns[0] === 'id')) {
        await this.schema.raw(`ALTER TABLE users ADD PRIMARY KEY (id)`)
      }
      if (await this.hasColumn('users', 'legacy_id')) {
        try {
          await this.schema.raw(`ALTER TABLE users ADD UNIQUE KEY users_legacy_id_unique (legacy_id)`)
        } catch {
          // Ignore if already exists
        }
      }
    }

    for (const ref of this.userReferences) {
      await this.schema.raw(
        `ALTER TABLE ${ref.table} ADD CONSTRAINT ${ref.table}_${ref.column}_foreign FOREIGN KEY (${ref.column}) REFERENCES users(id) ON DELETE ${ref.onDelete}`
      )
    }

    await this.schema.raw(`ALTER TABLE user_roles ADD PRIMARY KEY (user_id, role_id)`)

    await this.schema.raw(`CREATE UNIQUE INDEX favorites_property_id_user_id_unique ON favorites(property_id, user_id)`)
    await this.schema.raw(`CREATE UNIQUE INDEX reviews_property_id_user_id_unique ON reviews(property_id, user_id)`)

    await this.schema.raw(`CREATE INDEX notifications_user_id_is_read_index ON notifications(user_id, is_read)`)
    await this.schema.raw(`CREATE INDEX notifications_user_id_created_at_index ON notifications(user_id, created_at)`)
    await this.schema.raw(`CREATE INDEX visit_requests_tenant_id_index ON visit_requests(tenant_id)`)
    await this.schema.raw(`CREATE INDEX fcm_tokens_user_id_is_active_index ON fcm_tokens(user_id, is_active)`)
    await this.schema.raw(`CREATE INDEX landlord_availabilities_landlord_id_index ON landlord_availabilities(landlord_id)`)
    await this.schema.raw(`CREATE INDEX favorites_user_id_index ON favorites(user_id)`)
    await this.schema.raw(`CREATE INDEX property_views_user_id_index ON property_views(user_id)`)
    await this.schema.raw(`CREATE INDEX property_views_user_id_created_at_index ON property_views(user_id, created_at)`)
    await this.schema.raw(`CREATE INDEX property_questions_user_id_index ON property_questions(user_id)`)
    await this.schema.raw(`CREATE INDEX login_attempts_user_id_created_at_index ON login_attempts(user_id, created_at)`)
    await this.schema.raw(`CREATE INDEX password_reset_tokens_user_id_index ON password_reset_tokens(user_id)`)

    await this.schema.raw('SET FOREIGN_KEY_CHECKS = 1')
  }

  async down() {
    // Deprecated: replaced by public UUID strategy (keep INT PKs).
    return
    await this.schema.raw('SET FOREIGN_KEY_CHECKS = 0')

    for (const ref of this.userReferences) {
      const fkName = await this.getForeignKeyName(ref.table, ref.column)
      if (fkName) {
        await this.schema.raw(`ALTER TABLE ${ref.table} DROP FOREIGN KEY ${fkName}`)
      }
      await this.schema.raw(`ALTER TABLE ${ref.table} ADD COLUMN ${ref.column}_int INT UNSIGNED ${
        ref.nullable ? 'NULL' : 'NOT NULL'
      }`)
      await this.schema.raw(
        `UPDATE ${ref.table} t INNER JOIN users u ON t.${ref.column} = u.id SET t.${ref.column}_int = u.legacy_id`
      )
    }

    await this.schema.raw(`ALTER TABLE user_roles DROP PRIMARY KEY`)
    await this.schema.raw(`DROP INDEX favorites_property_id_user_id_unique ON favorites`)
    await this.schema.raw(`DROP INDEX reviews_property_id_user_id_unique ON reviews`)

    await this.schema.raw(`ALTER TABLE users DROP PRIMARY KEY`)
    await this.schema.raw(`ALTER TABLE users CHANGE COLUMN id uuid CHAR(36) NOT NULL`)
    await this.schema.raw(`ALTER TABLE users CHANGE COLUMN legacy_id id INT UNSIGNED NOT NULL AUTO_INCREMENT`)
    await this.schema.raw(`ALTER TABLE users ADD PRIMARY KEY (id)`)
    await this.schema.raw(`ALTER TABLE users DROP INDEX users_legacy_id_unique`)

    for (const ref of this.userReferences) {
      const hasLegacyColumn = await this.hasColumn(ref.table, ref.column)
      if (hasLegacyColumn) {
        try {
          await this.schema.raw(`ALTER TABLE ${ref.table} DROP COLUMN ${ref.column}`)
        } catch {
          // Ignore if column already removed
        }
      }
      const hasIntColumn = await this.hasColumn(ref.table, `${ref.column}_int`)
      if (hasIntColumn) {
        await this.schema.raw(
          `ALTER TABLE ${ref.table} CHANGE COLUMN ${ref.column}_int ${ref.column} INT UNSIGNED ${
            ref.nullable ? 'NULL' : 'NOT NULL'
          }`
        )
      }
      await this.schema.raw(
        `ALTER TABLE ${ref.table} ADD CONSTRAINT ${ref.table}_${ref.column}_foreign FOREIGN KEY (${ref.column}) REFERENCES users(id) ON DELETE ${ref.onDelete}`
      )
    }

    await this.schema.raw(`ALTER TABLE user_roles ADD PRIMARY KEY (user_id, role_id)`)
    await this.schema.raw(`ALTER TABLE users DROP COLUMN uuid`)

    await this.schema.raw('SET FOREIGN_KEY_CHECKS = 1')
  }
}
