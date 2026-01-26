import sharp from 'sharp'
import { join } from 'node:path'
import { unlink } from 'node:fs/promises'
import logger from '@adonisjs/core/services/logger'

/**
 * Service de traitement et optimisation d'images pour les propriétés
 * Fournit compression, redimensionnement, suppression EXIF et génération de thumbnails
 */
export class ImageProcessingService {
  // Limites et configurations
  private static readonly MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5 MB
  private static readonly MAX_DIMENSION = 2048 // 2048px
  private static readonly THUMBNAIL_SIZE = 400 // 400px pour les thumbnails
  private static readonly ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
  ]
  private static readonly OUTPUT_FORMAT = 'jpeg' // Toujours convertir en JPEG
  private static readonly JPEG_QUALITY = 85 // Qualité de compression (85 = bon équilibre qualité/taille)

  /**
   * Valide le type MIME d'un fichier
   * @param filePath - Chemin vers le fichier
   * @returns true si le fichier est valide
   */
  private static async validateMimeType(filePath: string): Promise<boolean> {
    try {
      const metadata = await sharp(filePath).metadata()
      const mimeType = metadata.format ? `image/${metadata.format}` : null

      if (!mimeType || !this.ALLOWED_MIME_TYPES.includes(mimeType)) {
        return false
      }

      return true
    } catch (error) {
      logger.error(`[IMAGE_PROCESSING] Erreur lors de la validation MIME type: ${error}`)
      return false
    }
  }

  /**
   * Traite une image : compression, redimensionnement, suppression EXIF
   * @param inputPath - Chemin du fichier source
   * @param outputPath - Chemin du fichier de sortie
   * @returns Chemin du fichier traité
   */
  static async processImage(inputPath: string, outputPath: string): Promise<string> {
    try {
      // 1. Valider le type MIME
      const isValidMime = await this.validateMimeType(inputPath)
      if (!isValidMime) {
        throw new Error(
          `Type de fichier non autorisé. Types acceptés: ${this.ALLOWED_MIME_TYPES.join(', ')}`
        )
      }

      // 2. Obtenir les métadonnées de l'image
      const metadata = await sharp(inputPath).metadata()
      const width = metadata.width || 0
      const height = metadata.height || 0

      // 3. Déterminer si un redimensionnement est nécessaire
      const needsResize = width > this.MAX_DIMENSION || height > this.MAX_DIMENSION

      // 4. Traiter l'image avec Sharp
      let sharpInstance = sharp(inputPath)

      // Redimensionner si nécessaire (maintenir le ratio)
      if (needsResize) {
        sharpInstance = sharpInstance.resize(this.MAX_DIMENSION, this.MAX_DIMENSION, {
          fit: 'inside', // Maintenir le ratio, redimensionner pour tenir dans les limites
          withoutEnlargement: true, // Ne pas agrandir les petites images
        })
      }

      // Convertir en JPEG, compresser et supprimer les métadonnées EXIF
      await sharpInstance
        .jpeg({
          quality: this.JPEG_QUALITY,
          mozjpeg: true, // Utiliser mozjpeg pour une meilleure compression
          progressive: true, // JPEG progressif pour un chargement progressif
        })
        .rotate() // Auto-rotation basée sur les métadonnées EXIF (avant suppression)
        .toFile(outputPath)

      logger.info(
        `[IMAGE_PROCESSING] Image traitée avec succès: ${inputPath} -> ${outputPath}`
      )

      return outputPath
    } catch (error: any) {
      logger.error(`[IMAGE_PROCESSING] Erreur lors du traitement de l'image: ${error.message}`)
      throw new Error(
        `Échec du traitement de l'image: ${error.message || 'Erreur inconnue'}`
      )
    }
  }

  /**
   * Génère un thumbnail d'une image
   * @param inputPath - Chemin du fichier source (peut être l'image originale ou déjà traitée)
   * @param thumbnailPath - Chemin du fichier thumbnail de sortie
   * @returns Chemin du fichier thumbnail
   */
  static async generateThumbnail(inputPath: string, thumbnailPath: string): Promise<string> {
    try {
      await sharp(inputPath)
        .resize(this.THUMBNAIL_SIZE, this.THUMBNAIL_SIZE, {
          fit: 'cover', // Recadrer pour remplir exactement les dimensions
          position: 'center', // Centrer le recadrage
        })
        .jpeg({
          quality: 80, // Qualité légèrement inférieure pour les thumbnails
          mozjpeg: true,
        })
        .toFile(thumbnailPath)

      logger.info(
        `[IMAGE_PROCESSING] Thumbnail généré avec succès: ${inputPath} -> ${thumbnailPath}`
      )

      return thumbnailPath
    } catch (error: any) {
      logger.error(`[IMAGE_PROCESSING] Erreur lors de la génération du thumbnail: ${error.message}`)
      throw new Error(
        `Échec de la génération du thumbnail: ${error.message || 'Erreur inconnue'}`
      )
    }
  }

  /**
   * Traite une image complète : compression + thumbnail
   * @param inputPath - Chemin du fichier source
   * @param outputPath - Chemin du fichier de sortie (image standard)
   * @param thumbnailPath - Chemin du fichier thumbnail de sortie
   * @returns Objet avec les chemins des fichiers générés
   */
  static async processImageWithThumbnail(
    inputPath: string,
    outputPath: string,
    thumbnailPath: string
  ): Promise<{ standard: string; thumbnail: string }> {
    try {
      // 1. Traiter l'image principale
      await this.processImage(inputPath, outputPath)

      // 2. Générer le thumbnail depuis l'image source (meilleure qualité)
      await this.generateThumbnail(inputPath, thumbnailPath)

      // 3. Supprimer le fichier source si c'était un fichier temporaire
      // (on le garde pour l'instant car AdonisJS le gère)

      return {
        standard: outputPath,
        thumbnail: thumbnailPath,
      }
    } catch (error: any) {
      // En cas d'erreur, nettoyer les fichiers partiellement créés
      try {
        await unlink(outputPath).catch(() => {})
        await unlink(thumbnailPath).catch(() => {})
      } catch {
        // Ignorer les erreurs de nettoyage
      }

      throw error
    }
  }

  /**
   * Valide la taille d'un fichier avant traitement
   * @param filePath - Chemin vers le fichier
   * @returns true si la taille est acceptable
   */
  static async validateFileSize(filePath: string): Promise<boolean> {
    try {
      const fs = await import('node:fs/promises')
      const stats = await fs.stat(filePath)
      return stats.size <= this.MAX_IMAGE_SIZE
    } catch (error) {
      logger.error(`[IMAGE_PROCESSING] Erreur lors de la validation de la taille: ${error}`)
      return false
    }
  }
}