import app from '@adonisjs/core/services/app'
import { join } from 'node:path'
import { mkdir, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import logger from '@adonisjs/core/services/logger'

/**
 * Service pour gérer les chemins et le stockage des photos de propriétés
 */
export class PropertyPhotoService {
  /**
   * Retourne le chemin du dossier d'une propriété
   * @param propertyId - ID de la propriété
   * @returns Chemin relatif: properties/property_<propertyId>
   */
  static getPropertyFolderPath(propertyId: number): string {
    return `properties/property_${propertyId}`
  }

  /**
   * Retourne le chemin complet du dossier d'une propriété
   * @param propertyId - ID de la propriété
   * @returns Chemin absolu: uploads/properties/property_<propertyId>
   */
  static getPropertyFolderFullPath(propertyId: number): string {
    return app.makePath('uploads', this.getPropertyFolderPath(propertyId))
  }

  /**
   * Crée le dossier d'une propriété s'il n'existe pas
   * @param propertyId - ID de la propriété
   */
  static async ensurePropertyFolderExists(propertyId: number): Promise<void> {
    const folderPath = this.getPropertyFolderFullPath(propertyId)
    
    try {
      // Vérifier si le dossier existe
      await access(folderPath, constants.F_OK)
    } catch {
      // Le dossier n'existe pas, le créer
      await mkdir(folderPath, { recursive: true })
      logger.debug(`[PROPERTY_PHOTO] Dossier créé: ${folderPath}`)
    }
  }

  /**
   * Construit l'URL publique d'une photo
   * @param photoRelativePath - Chemin relatif de la photo (ex: properties/property_1/img_1.jpg)
   * @returns URL publique: /uploads/properties/property_<propertyId>/<fileName>
   */
  static getPublicPhotoUrl(photoRelativePath: string): string {
    // Si le chemin est déjà une URL complète, le retourner tel quel
    if (photoRelativePath.startsWith('http://') || photoRelativePath.startsWith('https://')) {
      return photoRelativePath
    }
    // Sinon, construire l'URL relative au serveur AdonisJS
    return `/uploads/${photoRelativePath}`
  }

  /**
   * Extrait le nom du fichier depuis un chemin complet ou une URL
   * @param pathOrUrl - Chemin complet ou URL
   * @returns Nom du fichier
   */
  static extractFileName(pathOrUrl: string): string {
    // Si c'est une URL, extraire le nom du fichier
    if (pathOrUrl.includes('/')) {
      return pathOrUrl.split('/').pop() || pathOrUrl
    }
    return pathOrUrl
  }

  /**
   * Construit le chemin complet pour sauvegarder une photo
   * @param propertyId - ID de la propriété
   * @param fileName - Nom du fichier
   * @returns Chemin complet: uploads/properties/property_<propertyId>/<fileName>
   */
  static getPhotoFullPath(propertyId: number, fileName: string): string {
    return join(this.getPropertyFolderFullPath(propertyId), fileName)
  }

  /**
   * Supprime le dossier d'une propriété et toutes ses photos
   * @param propertyId - ID de la propriété
   */
  static async deletePropertyFolder(propertyId: number): Promise<void> {
    const folderPath = this.getPropertyFolderFullPath(propertyId)
    try {
      const fs = await import('node:fs/promises')
      await fs.rm(folderPath, { recursive: true, force: true })
      logger.info(`[PROPERTY_PHOTO] Dossier supprimé: ${folderPath}`)
    } catch (error: any) {
      logger.error(`[PROPERTY_PHOTO] Erreur lors de la suppression du dossier ${folderPath}: ${error.message}`)
      throw error
    }
  }
}
