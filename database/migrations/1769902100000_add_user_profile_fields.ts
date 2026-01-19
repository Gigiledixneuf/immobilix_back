import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.alterTable(this.tableName, (table) => {
      table.string('first_name', 100).nullable().after('full_name')
      table.string('last_name', 100).nullable().after('first_name')
      table.enum('gender', ['male', 'female']).nullable().after('last_name')
      table.date('date_of_birth').nullable().after('gender')
      table.string('profile_photo', 255).nullable().after('profile_photo_url')
    })

    await this.schema.raw(`
      UPDATE users
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

  async down() {
    this.schema.alterTable(this.tableName, (table) => {
      table.dropColumn('first_name')
      table.dropColumn('last_name')
      table.dropColumn('gender')
      table.dropColumn('date_of_birth')
      table.dropColumn('profile_photo')
    })
  }
}
