import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    const columnExists = async (column: string) => {
      const result: any = await this.db.rawQuery(
        `SHOW COLUMNS FROM ${this.tableName} LIKE '${column}'`
      )
      return result[0] && result[0].length > 0
    }

    if (!(await columnExists('first_name'))) {
      await this.db.rawQuery(
        `ALTER TABLE ${this.tableName} ADD COLUMN first_name VARCHAR(100) NULL AFTER full_name`
      )
    }
    if (!(await columnExists('last_name'))) {
      await this.db.rawQuery(
        `ALTER TABLE ${this.tableName} ADD COLUMN last_name VARCHAR(100) NULL AFTER first_name`
      )
    }
    if (!(await columnExists('gender'))) {
      await this.db.rawQuery(
        `ALTER TABLE ${this.tableName} ADD COLUMN gender ENUM('male', 'female') NULL AFTER last_name`
      )
    }
    if (!(await columnExists('date_of_birth'))) {
      await this.db.rawQuery(
        `ALTER TABLE ${this.tableName} ADD COLUMN date_of_birth DATE NULL AFTER gender`
      )
    }
    if (!(await columnExists('profile_photo'))) {
      const hasProfilePhotoUrl = await columnExists('profile_photo_url')
      const afterClause = hasProfilePhotoUrl ? 'AFTER profile_photo_url' : 'AFTER date_of_birth'
      await this.db.rawQuery(
        `ALTER TABLE ${this.tableName} ADD COLUMN profile_photo VARCHAR(255) NULL ${afterClause}`
      )
    }

    const hasFirstName = await columnExists('first_name')
    const hasLastName = await columnExists('last_name')
    const hasProfilePhoto = await columnExists('profile_photo')
    const hasFullName = await columnExists('full_name')
    const hasProfilePhotoUrl = await columnExists('profile_photo_url')

    if (hasFirstName && hasLastName && hasProfilePhoto && (hasFullName || hasProfilePhotoUrl)) {
      await this.db.rawQuery(`
        UPDATE ${this.tableName}
        SET
          first_name = CASE
            WHEN full_name IS NULL THEN NULL
            WHEN LOCATE(' ', full_name) = 0 THEN full_name
            ELSE TRIM(SUBSTRING(full_name, 1, LENGTH(full_name) - LENGTH(SUBSTRING_INDEX(full_name, ' ', -1)) - 1))
          END,
          last_name = CASE
            WHEN full_name IS NULL THEN NULL
            WHEN LOCATE(' ', full_name) = 0 THEN ''
            ELSE TRIM(SUBSTRING_INDEX(full_name, ' ', -1))
          END,
          profile_photo = profile_photo_url
        WHERE full_name IS NOT NULL OR profile_photo_url IS NOT NULL
      `)
    }
  }

  async down() {
    const dropColumnIfExists = async (column: string) => {
      const result: any = await this.db.rawQuery(
        `SHOW COLUMNS FROM ${this.tableName} LIKE '${column}'`
      )
      if (result[0] && result[0].length > 0) {
        try {
          await this.db.rawQuery(`ALTER TABLE ${this.tableName} DROP COLUMN ${column}`)
        } catch {
          // Ignore if already dropped
        }
      }
    }

    await dropColumnIfExists('first_name')
    await dropColumnIfExists('last_name')
    await dropColumnIfExists('gender')
    await dropColumnIfExists('date_of_birth')
    await dropColumnIfExists('profile_photo')
  }
}
