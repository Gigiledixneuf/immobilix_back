/*
|--------------------------------------------------------------------------
| Environment variables service
|--------------------------------------------------------------------------
|
| The `Env.create` method creates an instance of the Env service. The
| service validates the environment variables and also cast values
| to JavaScript data types.
|
*/

import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  APP_NAME: Env.schema.string.optional(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']),

  /*
  |----------------------------------------------------------
  | Variables for configuring database connection
  |----------------------------------------------------------
  */
  DB_HOST: Env.schema.string({ format: 'host' }),
  DB_PORT: Env.schema.number(),
  DB_USER: Env.schema.string(),
  DB_PASSWORD: Env.schema.string.optional(),
  DB_DATABASE: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Variables for Firebase Cloud Messaging (FCM)
  |----------------------------------------------------------
  */
  FIREBASE_PROJECT_ID: Env.schema.string.optional(),
  FIREBASE_PRIVATE_KEY: Env.schema.string.optional(),
  FIREBASE_CLIENT_EMAIL: Env.schema.string.optional(),
  // Alternative: chemin vers le fichier JSON de credentials Firebase
  FIREBASE_CREDENTIALS_PATH: Env.schema.string.optional(),

  /*
  |----------------------------------------------------------
  | Variables for Hedera Hashgraph
  |----------------------------------------------------------
  */
  HEDERA_ACCOUNT_ID: Env.schema.string.optional(),
  HEDERA_PRIVATE_KEY: Env.schema.string.optional(),
  HEDERA_MASTER_CONTRACT_ID: Env.schema.string.optional(),
  HEDERA_NETWORK: Env.schema.enum.optional(['testnet', 'mainnet']),

  /*
  |----------------------------------------------------------
  | Variables for Flutterwave (Mobile Money)
  |----------------------------------------------------------
  */
  FLW_SECRET_KEY: Env.schema.string.optional(),
  FLW_PUBLIC_KEY: Env.schema.string.optional(),
  FLW_WEBHOOK_HASH: Env.schema.string.optional(),
})
