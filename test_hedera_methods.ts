/**
 * Script de test pour les méthodes Hedera
 * 
 * Ce script teste les nouvelles méthodes implémentées :
 * - updateContractOnChain()
 * - terminateLease()
 * 
 * USAGE:
 * 1. Assurez-vous d'avoir configuré les variables d'environnement dans .env :
 *    - HEDERA_ACCOUNT_ID
 *    - HEDERA_PRIVATE_KEY
 *    - HEDERA_MASTER_CONTRACT_ID
 * 
 * 2. Assurez-vous d'avoir un contrat existant dans la DB avec un hederaContractId
 * 
 * 3. Lancez : node ace test:hedera
 *    OU : npx tsx test_hedera_methods.ts
 */

import 'dotenv/config'
import HederaService from './app/services/hedera_service.js'
import { DateTime } from 'luxon'

// Couleurs pour la console
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

/**
 * Test 1: updateContractOnChain - Mise à jour du statut
 */
async function testUpdateContractStatus() {
  log('\n🧪 TEST 1: Mise à jour du statut d\'un contrat', 'cyan')
  log('═'.repeat(60), 'cyan')

  try {
    const hederaService = new HederaService()
    
    // ⚠️ REMPLACEZ ces valeurs par un contrat existant dans votre DB
    const dbContractId = 1 // ID du contrat dans votre base de données
    const newStatus = 'active' // Nouveau statut

    log(`\n📝 Paramètres:`, 'yellow')
    log(`   - dbContractId: ${dbContractId}`)
    log(`   - newStatus: ${newStatus}`)

    log(`\n🔄 Appel de updateContractOnChain()...`, 'yellow')
    
    const transactionId = await hederaService.updateContractOnChain({
      dbContractId,
      newStatus,
    })

    log(`\n✅ SUCCÈS!`, 'green')
    log(`   Transaction ID: ${transactionId}`)
    log(`   Vérifiez sur Hedera Explorer: https://hashscan.io/testnet/transaction/${transactionId.split('@')[1]}`)
    
    return { success: true, transactionId }
  } catch (error) {
    log(`\n❌ ERREUR:`, 'red')
    log(`   ${error instanceof Error ? error.message : String(error)}`, 'red')
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Test 2: updateContractOnChain - Mise à jour de la date de fin
 */
async function testUpdateContractEndDate() {
  log('\n🧪 TEST 2: Mise à jour de la date de fin d\'un contrat', 'cyan')
  log('═'.repeat(60), 'cyan')

  try {
    const hederaService = new HederaService()
    
    // ⚠️ REMPLACEZ ces valeurs par un contrat existant dans votre DB
    const dbContractId = 1 // ID du contrat dans votre base de données
    const newEndDate = DateTime.now().plus({ years: 2 }) // Date dans 2 ans

    log(`\n📝 Paramètres:`, 'yellow')
    log(`   - dbContractId: ${dbContractId}`)
    log(`   - newEndDate: ${newEndDate.toISO()}`)

    log(`\n🔄 Appel de updateContractOnChain()...`, 'yellow')
    
    const transactionId = await hederaService.updateContractOnChain({
      dbContractId,
      newEndDate,
    })

    log(`\n✅ SUCCÈS!`, 'green')
    log(`   Transaction ID: ${transactionId}`)
    
    return { success: true, transactionId }
  } catch (error) {
    log(`\n❌ ERREUR:`, 'red')
    log(`   ${error instanceof Error ? error.message : String(error)}`, 'red')
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Test 3: updateContractOnChain - Mise à jour complète (date + statut)
 */
async function testUpdateContractComplete() {
  log('\n🧪 TEST 3: Mise à jour complète (date + statut)', 'cyan')
  log('═'.repeat(60), 'cyan')

  try {
    const hederaService = new HederaService()
    
    // ⚠️ REMPLACEZ ces valeurs par un contrat existant dans votre DB
    const dbContractId = 1 // ID du contrat dans votre base de données
    const newEndDate = DateTime.now().plus({ years: 1 })
    const newStatus = 'renewed'

    log(`\n📝 Paramètres:`, 'yellow')
    log(`   - dbContractId: ${dbContractId}`)
    log(`   - newEndDate: ${newEndDate.toISO()}`)
    log(`   - newStatus: ${newStatus}`)

    log(`\n🔄 Appel de updateContractOnChain()...`, 'yellow')
    
    const transactionId = await hederaService.updateContractOnChain({
      dbContractId,
      newEndDate,
      newStatus,
    })

    log(`\n✅ SUCCÈS!`, 'green')
    log(`   Transaction ID: ${transactionId}`)
    
    return { success: true, transactionId }
  } catch (error) {
    log(`\n❌ ERREUR:`, 'red')
    log(`   ${error instanceof Error ? error.message : String(error)}`, 'red')
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Test 4: terminateLease - Résiliation d'un contrat
 */
async function testTerminateLease() {
  log('\n🧪 TEST 4: Résiliation d\'un contrat (terminateLease)', 'cyan')
  log('═'.repeat(60), 'cyan')

  try {
    const hederaService = new HederaService()
    
    // ⚠️ REMPLACEZ cette valeur par un contrat existant dans votre DB
    const dbContractId = 1 // ID du contrat dans votre base de données

    log(`\n📝 Paramètres:`, 'yellow')
    log(`   - dbContractId: ${dbContractId}`)

    log(`\n⚠️  ATTENTION: Cette action va résilier le contrat sur la blockchain!`, 'yellow')
    log(`🔄 Appel de terminateLease()...`, 'yellow')
    
    const transactionId = await hederaService.terminateLease(dbContractId)

    log(`\n✅ SUCCÈS!`, 'green')
    log(`   Transaction ID: ${transactionId}`)
    log(`   Le contrat a été résilié sur la blockchain.`)
    
    return { success: true, transactionId }
  } catch (error) {
    log(`\n❌ ERREUR:`, 'red')
    log(`   ${error instanceof Error ? error.message : String(error)}`, 'red')
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

/**
 * Test 5: Vérification des variables d'environnement
 */
function testEnvironmentVariables() {
  log('\n🔍 VÉRIFICATION DES VARIABLES D\'ENVIRONNEMENT', 'blue')
  log('═'.repeat(60), 'blue')

  const required = [
    'HEDERA_ACCOUNT_ID',
    'HEDERA_PRIVATE_KEY',
    'HEDERA_MASTER_CONTRACT_ID',
  ]

  let allPresent = true

  for (const key of required) {
    const value = process.env[key]
    if (value) {
      const displayValue = key === 'HEDERA_PRIVATE_KEY' 
        ? `${value.substring(0, 20)}...` 
        : value
      log(`✅ ${key}: ${displayValue}`, 'green')
    } else {
      log(`❌ ${key}: MANQUANTE`, 'red')
      allPresent = false
    }
  }

  if (!allPresent) {
    log(`\n⚠️  Veuillez configurer toutes les variables d'environnement dans le fichier .env`, 'yellow')
  }

  return allPresent
}

/**
 * Fonction principale
 */
async function main() {
  log('\n╔══════════════════════════════════════════════════════════╗', 'cyan')
  log('║     TEST DES MÉTHODES HEDERA - ImmobiliX                 ║', 'cyan')
  log('╚══════════════════════════════════════════════════════════╝', 'cyan')

  // Vérification des variables d'environnement
  const envOk = testEnvironmentVariables()
  if (!envOk) {
    log('\n❌ Impossible de continuer sans les variables d'environnement.', 'red')
    process.exit(1)
  }

  log('\n📌 INSTRUCTIONS:', 'yellow')
  log('   1. Modifiez les valeurs de dbContractId dans ce script', 'yellow')
  log('   2. Assurez-vous que le contrat existe dans votre DB', 'yellow')
  log('   3. Le contrat doit avoir un hederaContractId valide', 'yellow')
  log('\n💡 Vous pouvez commenter/décommenter les tests à exécuter', 'yellow')

  // Menu de sélection (décommentez les tests que vous voulez exécuter)
  const tests = [
    // testUpdateContractStatus,      // Décommentez pour tester
    // testUpdateContractEndDate,      // Décommentez pour tester
    // testUpdateContractComplete,     // Décommentez pour tester
    // testTerminateLease,             // Décommentez pour tester (⚠️ résilie le contrat!)
  ]

  if (tests.length === 0) {
    log('\n⚠️  Aucun test sélectionné. Décommentez les tests dans le script.', 'yellow')
    log('\n📝 Exemple de commande pour exécuter tous les tests:', 'yellow')
    log('   node ace test:hedera', 'yellow')
    return
  }

  log(`\n🚀 Exécution de ${tests.length} test(s)...\n`, 'green')

  const results = []
  for (const test of tests) {
    const result = await test()
    results.push(result)
    
    // Attendre un peu entre les tests
    await new Promise(resolve => setTimeout(resolve, 2000))
  }

  // Résumé
  log('\n╔══════════════════════════════════════════════════════════╗', 'cyan')
  log('║                    RÉSUMÉ DES TESTS                       ║', 'cyan')
  log('╚══════════════════════════════════════════════════════════╝', 'cyan')

  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length

  log(`\n✅ Réussis: ${successCount}`, 'green')
  log(`❌ Échoués: ${failCount}`, failCount > 0 ? 'red' : 'reset')

  if (failCount > 0) {
    log('\n📋 Détails des erreurs:', 'yellow')
    results.forEach((result, index) => {
      if (!result.success) {
        log(`   Test ${index + 1}: ${result.error}`, 'red')
      }
    })
  }

  process.exit(failCount > 0 ? 1 : 0)
}

// Exécution
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    log(`\n❌ Erreur fatale: ${error.message}`, 'red')
    console.error(error)
    process.exit(1)
  })
}

export { 
  testUpdateContractStatus,
  testUpdateContractEndDate,
  testUpdateContractComplete,
  testTerminateLease,
  testEnvironmentVariables,
}

