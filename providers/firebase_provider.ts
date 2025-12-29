import type { ApplicationService } from '@adonisjs/core/types'
import FirebaseService from '#services/firebase_service'

export default class FirebaseProvider {
  constructor(protected app: ApplicationService) {}

  /**
   * Initialise Firebase Admin SDK après le boot de l'application
   */
  async boot() {
    try {
      await FirebaseService.initialize()
    } catch (error: unknown) {
      // Ne pas faire échouer le démarrage si Firebase n'est pas configuré
      // (utile pour le développement local ou si Firebase n'est pas encore configuré)
      // Utiliser console au lieu du logger car le logger peut ne pas être disponible pendant le boot
      console.warn('⚠️ Firebase Admin SDK not initialized (this is OK if credentials are not set yet)')
      
      // Logger l'erreur de manière sécurisée
      try {
        const errorMessage = error && typeof error === 'object' && 'message' in error
          ? String(error.message)
          : error
          ? String(error)
          : 'Unknown error'
        console.debug(`Firebase initialization error: ${errorMessage}`)
      } catch {
        // Ignorer les erreurs de logging
      }
    }
  }
}

