import admin from 'firebase-admin'
import env from '#start/env'
import FcmToken from '#models/fcm_token'

/**
 * Service Firebase pour gérer FCM (Firebase Cloud Messaging)
 */
export default class FirebaseService {
  private static initialized = false

  /**
   * Initialise Firebase Admin SDK
   */
  static async initialize() {
    if (this.initialized) {
      return
    }

    // Vérifier si Firebase est déjà initialisé (par une autre instance)
    try {
      admin.app()
      this.initialized = true
      try {
        const logger = await import('@adonisjs/core/services/logger')
        logger.default.info('Firebase Admin SDK already initialized')
      } catch {
        // Logger non disponible, ignorer
      }
      return
    } catch {
      // Firebase n'est pas encore initialisé, continuer
    }

    try {
      // Option 1: Utiliser un fichier JSON de credentials
      if (env.get('FIREBASE_CREDENTIALS_PATH')) {
        const fs = await import('node:fs/promises')
        const path = await import('node:path')
        const credentialsPath = env.get('FIREBASE_CREDENTIALS_PATH')!
        const resolvedPath = path.resolve(process.cwd(), credentialsPath)
        const fileContent = await fs.readFile(resolvedPath, 'utf-8')
        const serviceAccount = JSON.parse(fileContent)
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        })
      }
      // Option 2: Utiliser les variables d'environnement
      else {
        const projectId = env.get('FIREBASE_PROJECT_ID')
        const privateKeyEnv = env.get('FIREBASE_PRIVATE_KEY')
        const clientEmail = env.get('FIREBASE_CLIENT_EMAIL')

        if (projectId && privateKeyEnv && clientEmail) {
          // Décoder la clé privée (remplacer \n par de vrais retours à la ligne)
          const privateKey = privateKeyEnv.replace(/\\n/g, '\n')

          admin.initializeApp({
            credential: admin.credential.cert({
              projectId,
              privateKey,
              clientEmail,
            }),
          })
        } else {
          // Pas de credentials configurés - ce n'est pas une erreur
          // L'application peut fonctionner sans Firebase (notifications FCM désactivées)
          try {
            const logger = await import('@adonisjs/core/services/logger')
            logger.default.debug(
              'Firebase Admin SDK not initialized: Missing credentials. Set FIREBASE_CREDENTIALS_PATH or FIREBASE_PROJECT_ID, FIREBASE_PRIVATE_KEY, and FIREBASE_CLIENT_EMAIL to enable FCM notifications'
            )
          } catch {
            // Logger non disponible, ignorer
          }
          this.initialized = false
          return
        }
      }

      this.initialized = true
      try {
        const logger = await import('@adonisjs/core/services/logger')
        logger.default.info('Firebase Admin SDK initialized successfully')
      } catch {
        // Logger non disponible, ignorer
      }
    } catch (error: any) {
      // Ne pas throw l'erreur - permettre à l'app de démarrer sans Firebase
      // Firebase pourra être réinitialisé plus tard si nécessaire
      this.initialized = false
      
      // Logger l'erreur de manière sécurisée
      try {
        const logger = await import('@adonisjs/core/services/logger')
        const errorMessage = error?.message || (error ? String(error) : 'Unknown error')
        if (!errorMessage.includes('Missing credentials')) {
          logger.default.warn('Firebase Admin SDK initialization skipped:', errorMessage)
        } else {
          logger.default.debug('Firebase Admin SDK not initialized: credentials not configured')
        }
      } catch (logError) {
        // Si même le logger échoue, utiliser console comme fallback
        const errorMessage = error?.message || (error ? String(error) : 'Unknown error')
        console.warn('Firebase Admin SDK initialization skipped:', errorMessage)
      }
      return
    }
  }

  /**
   * Envoie une notification push à un token FCM
   */
  static async sendToToken(
    token: string,
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<boolean> {
    if (!this.initialized) {
      await this.initialize()
      if (!this.initialized) {
        try {
          const logger = await import('@adonisjs/core/services/logger')
          logger.default.warn('Firebase not initialized, skipping FCM notification')
        } catch {
          // Logger non disponible, ignorer
        }
        return false
      }
    }

    try {
      const message: admin.messaging.Message = {
        token,
        notification: {
          title,
          body,
        },
        data: data
          ? Object.fromEntries(
              Object.entries(data).map(([key, value]) => [key, String(value)])
            )
          : undefined,
        android: {
          priority: 'high' as const,
          notification: {
            sound: 'default',
            channelId: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      }

      const response = await admin.messaging().send(message)
      try {
        const logger = await import('@adonisjs/core/services/logger')
        logger.default.info('FCM notification sent successfully:', response)
      } catch {
        // Logger non disponible, ignorer
      }
      return true
    } catch (error: any) {
      // Gérer les tokens invalides
      if (error.code === 'messaging/invalid-registration-token' || error.code === 'messaging/registration-token-not-registered') {
        try {
          const logger = await import('@adonisjs/core/services/logger')
          logger.default.warn(`Invalid FCM token: ${token}, removing from database`)
        } catch {
          // Logger non disponible, ignorer
        }
        // Supprimer le token invalide de la base de données
        await FcmToken.query().where('token', token).delete()
        return false
      }

      try {
        const logger = await import('@adonisjs/core/services/logger')
        logger.default.error('Error sending FCM notification:', error.message)
      } catch {
        // Logger non disponible, ignorer
      }
      return false
    }
  }

  /**
   * Envoie une notification push à plusieurs tokens FCM
   */
  static async sendToTokens(
    tokens: string[],
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<{ successCount: number; failureCount: number }> {
    if (!this.initialized) {
      await this.initialize()
      if (!this.initialized) {
        logger.warn('Firebase not initialized, skipping FCM notification')
        return { successCount: 0, failureCount: tokens.length }
      }
    }

    if (tokens.length === 0) {
      return { successCount: 0, failureCount: 0 }
    }

    try {
      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title,
          body,
        },
        data: data
          ? Object.fromEntries(
              Object.entries(data).map(([key, value]) => [key, String(value)])
            )
          : undefined,
        android: {
          priority: 'high' as const,
          notification: {
            sound: 'default',
            channelId: 'default',
          },
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
            },
          },
        },
      }

      const response = await admin.messaging().sendEachForMulticast(message)
      
      // Supprimer les tokens invalides
      if (response.failureCount > 0) {
        const invalidTokens: string[] = []
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const error = resp.error
            if (
              error?.code === 'messaging/invalid-registration-token' ||
              error?.code === 'messaging/registration-token-not-registered'
            ) {
              invalidTokens.push(tokens[idx])
            }
          }
        })

        if (invalidTokens.length > 0) {
          await FcmToken.query().whereIn('token', invalidTokens).delete()
          try {
            const logger = await import('@adonisjs/core/services/logger')
            logger.default.info(`Removed ${invalidTokens.length} invalid FCM tokens from database`)
          } catch {
            // Logger non disponible, ignorer
          }
        }
      }

      try {
        const logger = await import('@adonisjs/core/services/logger')
        logger.default.info(
          `FCM multicast notification sent: ${response.successCount} success, ${response.failureCount} failures`
        )
      } catch {
        // Logger non disponible, ignorer
      }
      return {
        successCount: response.successCount,
        failureCount: response.failureCount,
      }
    } catch (error: any) {
      try {
        const logger = await import('@adonisjs/core/services/logger')
        logger.default.error('Error sending FCM multicast notification:', error.message)
      } catch {
        // Logger non disponible, ignorer
      }
      return { successCount: 0, failureCount: tokens.length }
    }
  }

  /**
   * Envoie une notification push à tous les tokens actifs d'un utilisateur
   */
  static async sendToUser(
    userId: string,
    title: string,
    body: string,
    data?: Record<string, string>
  ): Promise<boolean> {
    const tokens = await FcmToken.query()
      .where('user_id', userId)
      .where('is_active', true)
      .select('token')

    if (tokens.length === 0) {
      try {
        const logger = await import('@adonisjs/core/services/logger')
        logger.default.debug(`No active FCM tokens found for user ${userId}`)
      } catch {
        // Logger non disponible, ignorer
      }
      return false
    }

    const tokenStrings = tokens.map((t) => t.token)
    const result = await this.sendToTokens(tokenStrings, title, body, data)
    return result.successCount > 0
  }
}

