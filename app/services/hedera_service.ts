// app/services/HederaService.ts

// Importation des classes nécessaires du SDK Hedera pour interagir avec le réseau.
import {
  Client, // Client pour la connexion au réseau Hedera.
  ContractId, // Classe pour représenter l'ID d'un smart contract.
  ContractExecuteTransaction, // Classe pour appeler une fonction d'un smart contract.
  ContractFunctionParameters, // Classe pour encoder les arguments passés à une fonction de contrat.
  PrivateKey, // Classe pour la clé privée de l'opérateur du compte.
} from '@hashgraph/sdk'

// ===================================================
// 🔹 1. CLASSE PRINCIPALE DU SERVICE HEDERA
// ===================================================
// Service encapsulant la logique d'interaction avec le réseau Hedera.
export default class HederaService {
  // Instance du client Hedera, utilisé pour envoyer les transactions.
  private client: Client
  // Clé privée du compte opérateur qui paie les frais de transaction.
  private operatorKey: PrivateKey
  // ID du contrat intelligent principal déployé sur Hedera.
  private readonly MASTER_CONTRACT_ID = process.env.HEDERA_MASTER_CONTRACT_ID!

  // =============================
  // 🔹 2. CONSTRUCTEUR ET INITIALISATION
  // =============================
  constructor() {
    // Vérification des identifiants (credentials) de l'opérateur dans les variables d'environnement.
    if (!process.env.HEDERA_ACCOUNT_ID || !process.env.HEDERA_PRIVATE_KEY) {
      throw new Error('Missing Hedera credentials')
    }

    const operatorId = process.env.HEDERA_ACCOUNT_ID
    let cleanedKey = process.env.HEDERA_PRIVATE_KEY.trim()

    try {
      // Conversion de la clé privée depuis sa chaîne de caractères (format DER).
      this.operatorKey = PrivateKey.fromStringDer(cleanedKey) // ✅ DER format OK
    } catch (e) {
      console.error('Invalid Hedera private key', e)
      throw e
    }

    // Configuration du client pour utiliser le réseau de test (forTestnet) et définir l'opérateur.
    this.client = Client.forTestnet().setOperator(operatorId, this.operatorKey)
    // Définit le délai d'attente maximum pour les requêtes.
    this.client.setRequestTimeout(20_000)
  }

  // ===================================================
  // 🔹 3. CRÉATION D'UN CONTRAT (BAIL) SUR LA CHAÎNE
  // ===================================================
  // Appelle la fonction 'createNewLease' du smart contract pour enregistrer un nouveau bail.
  async createContratOnChain(data: any): Promise<string> {
    // Convertit l'ID du contrat principal en un objet ContractId.
    const contract = ContractId.fromString(this.MASTER_CONTRACT_ID)

    // Encode les paramètres à envoyer au smart contract.
    const params = new ContractFunctionParameters()
      .addUint256(data.contractId) // ID du contrat dans la DB.
      .addUint256(data.landlordId) // ID du propriétaire.
      .addUint256(data.tenantId) // ID du locataire.
      .addUint64(data.endDate ? data.endDate.toSeconds() : 0) // Date de fin (timestamp).
      .addUint256(data.rentAmount) // Montant du loyer.
      .addString(data.currency) // Devise du loyer.
      .addString(data.status) // Statut du contrat.
      .addUint256(data.depositMonths) // Nombre de mois de caution.
      .addUint256(data.depositAmount ?? 0) // Montant de la caution.
      .addString(data.depositStatus) // Statut de la caution.

    // Prépare et exécute la transaction d'appel de fonction de contrat.
    const tx = await new ContractExecuteTransaction()
      .setContractId(contract)
      .setGas(900000) // Définit la limite de gaz pour l'exécution du contrat.
      .setFunction("createNewLease", params) // Nom de la fonction Solidity à appeler.
      .execute(this.client)

    // Récupère le reçu de la transaction pour vérifier le statut.
    const receipt = await tx.getReceipt(this.client)

    // Vérifie si le statut du reçu est un succès.
    if (!receipt.status.toString().includes("SUCCESS")) {
      throw new Error("Lease creation failed: " + receipt.status.toString())
    }

    // Retourne l'ID de la transaction confirmée.
    return tx.transactionId.toString()
  }

  // ===================================================
  // 🔹 4. ENREGISTREMENT D'UN PAIEMENT SUR LA CHAÎNE
  // ===================================================
  // Appelle la fonction 'makePayment' du smart contract pour enregistrer un paiement.
  async makePaymentOnChain(data: any): Promise<string> {
    // Convertit l'ID du contrat principal en un objet ContractId.
    const contract = ContractId.fromString(this.MASTER_CONTRACT_ID)

    // Encode les paramètres à envoyer au smart contract.
    const params = new ContractFunctionParameters()
      .addUint256(data.dbContractId) // ID du contrat concerné dans la DB.
      .addUint256(data.paymentId) // ID du paiement dans la DB.
      .addUint256(data.amount) // Montant du paiement.
      .addString(data.paymentMethod) // Méthode de paiement.

    // Prépare et exécute la transaction d'appel de fonction de contrat.
    const tx = await new ContractExecuteTransaction()
      .setContractId(contract)
      .setGas(500000) // Définit la limite de gaz.
      .setFunction('makePayment', params) // Nom de la fonction Solidity à appeler.
      .execute(this.client)

    // Récupère le reçu de la transaction pour vérifier le statut.
    const receipt = await tx.getReceipt(this.client)

    // Vérifie si le statut du reçu est un succès.
    if (!receipt.status.toString().includes('SUCCESS')) {
      throw new Error('Payment failed: ' + receipt.status.toString())
    }

    // Retourne l'ID de la transaction confirmée.
    return tx.transactionId.toString()
  }

  // ===================================================
  // 🔹 5. MISE À JOUR D'UN CONTRAT SUR LA CHAÎNE
  // ===================================================
  /**
   * Met à jour un contrat existant sur la chaîne Hedera
   * @param updates - Les mises à jour à apporter (dbContractId, newEndDate, newStatus)
   */
  async updateContractOnChain(updates: {
    dbContractId: number
    newEndDate?: any
    newStatus?: string
  }): Promise<string> {
    const contract = ContractId.fromString(this.MASTER_CONTRACT_ID)
    const results: string[] = []

    try {
      // Si une nouvelle date de fin est fournie, mettre à jour
      if (updates.newEndDate !== undefined && updates.newEndDate !== null) {
        let timestamp: number = 0
        
        // Gérer différents formats de date (DateTime de Luxon, Date JS, string, number)
        if (updates.newEndDate && typeof updates.newEndDate.toSeconds === 'function') {
          // DateTime de Luxon
          timestamp = updates.newEndDate.toSeconds()
        } else if (updates.newEndDate instanceof Date) {
          timestamp = Math.floor(updates.newEndDate.getTime() / 1000)
        } else if (typeof updates.newEndDate === 'string') {
          timestamp = Math.floor(new Date(updates.newEndDate).getTime() / 1000)
        } else if (typeof updates.newEndDate === 'number') {
          timestamp = Math.floor(updates.newEndDate / 1000)
        }

        const params = new ContractFunctionParameters()
          .addUint256(updates.dbContractId)
          .addUint64(timestamp)

        const tx = await new ContractExecuteTransaction()
          .setContractId(contract)
          .setGas(400000)
          .setFunction('updateEndDate', params)
          .execute(this.client)

        const receipt = await tx.getReceipt(this.client)
        if (!receipt.status.toString().includes('SUCCESS')) {
          throw new Error(`EndDate update failed: ${receipt.status.toString()}`)
        }
        results.push(tx.transactionId.toString())
      }

      // Si un nouveau statut est fourni, mettre à jour
      if (updates.newStatus !== undefined && updates.newStatus !== null) {
        const params = new ContractFunctionParameters()
          .addUint256(updates.dbContractId)
          .addString(updates.newStatus)

        const tx = await new ContractExecuteTransaction()
          .setContractId(contract)
          .setGas(400000)
          .setFunction('updateStatus', params)
          .execute(this.client)

        const receipt = await tx.getReceipt(this.client)
        if (!receipt.status.toString().includes('SUCCESS')) {
          throw new Error(`Status update failed: ${receipt.status.toString()}`)
        }
        results.push(tx.transactionId.toString())
      }

      if (results.length === 0) {
        throw new Error('Aucune mise à jour à effectuer')
      }

      // Retourner la dernière transaction (ou toutes si nécessaire)
      return results[results.length - 1]
    } catch (error) {
      console.error('Erreur lors de la mise à jour du contrat Hedera:', error)
      throw new Error(
        `Échec de la mise à jour du contrat on-chain: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }

  // ===================================================
  // 🔹 6. RÉSILIATION D'UN CONTRAT SUR LA CHAÎNE
  // ===================================================
  /**
   * Résilie un contrat de location sur la chaîne Hedera
   * @param dbContractId - L'ID du contrat dans la base de données
   * @returns L'ID de la transaction de résiliation
   */
  async terminateLease(dbContractId: number): Promise<string> {
    const contract = ContractId.fromString(this.MASTER_CONTRACT_ID)

    try {
      // Mettre le statut à "terminated" ou "résilié"
      const params = new ContractFunctionParameters()
        .addUint256(dbContractId)
        .addString('terminated')

      const tx = await new ContractExecuteTransaction()
        .setContractId(contract)
        .setGas(400000)
        .setFunction('updateStatus', params)
        .execute(this.client)

      const receipt = await tx.getReceipt(this.client)
      if (!receipt.status.toString().includes('SUCCESS')) {
        throw new Error(`Lease termination failed: ${receipt.status.toString()}`)
      }

      return tx.transactionId.toString()
    } catch (error) {
      console.error('Erreur lors de la résiliation du contrat Hedera:', error)
      throw new Error(
        `Échec de la résiliation du contrat on-chain: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }
}
