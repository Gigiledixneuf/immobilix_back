import 'dotenv/config'

export interface InitiateParams {
  amount: number
  currency: string
  reference: string
  customer: { email?: string; phonenumber?: string; name?: string }
  redirect_url?: string
}

export interface InitiateResult {
  reference: string
  providerReference?: string
  checkoutUrl?: string
}

export default class FlutterwaveProvider {
  private readonly baseUrl = 'https://api.flutterwave.com/v3'
  private readonly secretKey = process.env.FLW_SECRET_KEY
  private readonly webhookHash = process.env.FLW_WEBHOOK_HASH // pour vérification header 'verif-hash'

  private get authHeader() {
    if (!this.secretKey) throw new Error('FLW_SECRET_KEY manquant dans .env')
    return { Authorization: `Bearer ${this.secretKey}`, 'Content-Type': 'application/json' }
  }

  /**
   * Minimal: crée une intention de paiement standard (checkout) pour mobile.
   * Pour un vrai flux Mobile Money, adapter l’endpoint "charges" selon l’opérateur.
   */
  async initiatePayment(params: InitiateParams): Promise<InitiateResult> {
    const body = {
      tx_ref: params.reference,
      amount: params.amount,
      currency: params.currency,
      redirect_url: params.redirect_url,
      customer: params.customer,
      payment_options: 'mobilemoney,card,ussd',
    }

    const res = await fetch(`${this.baseUrl}/payments`, {
      method: 'POST',
      headers: this.authHeader,
      body: JSON.stringify(body),
    })
    const json = (await res.json()) as any
    if (!res.ok) {
      throw new Error(`Flutterwave initiate error: ${json?.message || res.statusText}`)
    }
    return {
      reference: params.reference,
      providerReference: json?.data?.flw_ref,
      checkoutUrl: json?.data?.link,
    }
  }

  /**
   * Vérifie la signature de webhook Flutterwave
   * 
   * Flutterwave utilise deux méthodes de vérification :
   * 1. Header 'verif-hash' : hash simple à comparer avec FLW_WEBHOOK_HASH
   * 2. Header 'x-flutterwave-signature' : signature HMAC SHA512 du payload
   * 
   * @param headerHash - Hash ou signature du header
   */
  verifyWebhookSignature(headerHash?: string): boolean {
    if (!headerHash) return false

    // Méthode 1: Vérification simple avec verif-hash (MVP)
    if (this.webhookHash && headerHash === this.webhookHash) {
      return true
    }

    // Méthode 2: Vérification HMAC (recommandée pour production)
    // TODO: Implémenter la vérification HMAC SHA512 avec la secret key
    // const crypto = require('crypto')
    // const expectedSignature = crypto
    //   .createHmac('sha512', this.secretKey)
    //   .update(JSON.stringify(rawBody))
    //   .digest('hex')
    // return crypto.timingSafeEqual(Buffer.from(headerHash), Buffer.from(expectedSignature))

    // Pour l'instant, on accepte seulement la méthode simple
    return false
  }
}




