import { BaseCommand, args, flags } from '@adonisjs/core/ace'
import type { CommandOptions } from '@adonisjs/core/types/ace'
import VisitFlowService from '#services/visit_flow_service'

export default class ProcessVisitAutomaticActions extends BaseCommand {
  static commandName = 'visit:process-automatic-actions'
  static description = 'Traite automatiquement les visites (détection no-show, auto-cancellation)'

  static options: CommandOptions = {
    startApp: true,
  }

  /**
   * Exécute la commande
   */
  async run() {
    this.logger.info('Démarrage du traitement automatique des visites...')

    const flowService = new VisitFlowService()

    try {
      const results = await flowService.processAutomaticActions()

      this.logger.success(
        `Traitement terminé : ${results.noShows} no-show détectés, ${results.autoCancelled} visites auto-annulées`
      )

      if (results.noShows > 0 || results.autoCancelled > 0) {
        this.logger.info(`Détails :`)
        if (results.noShows > 0) {
          this.logger.info(`  - ${results.noShows} visite(s) marquée(s) comme no-show`)
        }
        if (results.autoCancelled > 0) {
          this.logger.info(`  - ${results.autoCancelled} visite(s) auto-annulée(s)`)
        }
      } else {
        this.logger.info('Aucune action automatique nécessaire.')
      }
    } catch (error: any) {
      this.logger.error(`Erreur lors du traitement : ${error.message}`)
      this.exitCode = 1
    }
  }
}
