const WebhooksController = () => import('#controllers/webhooks_controller')
/*
|--------------------------------------------------------------------------
| Routes file
|--------------------------------------------------------------------------
|
| The routes file is used for defining the HTTP routes.
|
*/

import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
const ContractsController = () => import('#controllers/contracts_controller')
const PaymentsController = () => import('#controllers/payments_controller')
const PropertiesController = () => import('#controllers/Bailleur/properties_controller')
const ApplicationsController = () => import('#controllers/applications_controller')
const VisitRequestsController = () => import('#controllers/VisitRequestsController')
const PropertyQuestionsController = () => import('#controllers/PropertyQuestionsController')
const InvitesController = () => import('#controllers/invites_controller')
const PublicPropertiesController = () => import('#controllers/Public/properties_controller')
const ProfilesController = () => import('#controllers/profiles_controller')
const AdminUsersController = () => import('#controllers/Admin/users_controller')
const LoginController = () => import('#controllers/Auth/login_controller')
const RegistersController = () => import('#controllers/Auth/registers_controller')
const LogoutController = () => import('#controllers/Auth/logout_controller')
const ForgotPasswordsController = () => import('#controllers/Auth/forgot_passwords_controller')
const NotificationsController = () => import('#controllers/notifications_controller')
const InvoicesController = () => import('#controllers/invoices_controller')
const DashboardController = () => import('#controllers/Bailleur/dashboard_controller')
const SearchesController = () => import('#controllers/searches_controller')
const MessagesController = () => import('#controllers/messages_controller')
const FcmTokensController = () => import('#controllers/fcm_tokens_controller')

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

// Route pour servir les fichiers statiques (images uploadées)
// ⚠️ IMPORTANT: Cette route doit être AVANT les autres routes groupées
// pour éviter qu'elle soit interceptée par les middlewares ou préfixes
// Utiliser un pattern catch-all pour capturer tout après /uploads/
router.get('/uploads/*', async ({ request, response }) => {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const logger = (await import('@adonisjs/core/services/logger')).default
  
  try {
    // Extraire le chemin directement depuis l'URL
    const urlPath = request.url()
    let extractedPath = ''
    
    // Extraire tout ce qui suit /uploads/
    if (urlPath.includes('/uploads/')) {
      extractedPath = urlPath.split('/uploads/')[1] || ''
      // Nettoyer les query parameters si présents
      if (extractedPath.includes('?')) {
        extractedPath = extractedPath.split('?')[0]
      }
      // Décoder l'URL (pour gérer les espaces %20, etc.)
      extractedPath = decodeURIComponent(extractedPath)
    }
    
    if (!extractedPath) {
      logger.warn(`Upload route called without file path. URL: ${urlPath}`)
      return response.status(404).json({
        status: 'error',
        message: 'Chemin du fichier manquant',
        code: 'FILE_PATH_MISSING',
        url: urlPath,
      })
    }
    
    // Logger pour debug
    console.log(`📁 Serving file: ${extractedPath}`)
    logger.info(`Serving static file: ${extractedPath}`)
    
    // Construire le chemin complet vers le fichier
    // Utiliser process.cwd() qui pointe toujours vers la racine du projet
    // C'est plus fiable que import.meta.url qui peut varier selon le contexte
    const projectRoot = process.cwd()
    const uploadsDir = path.join(projectRoot, 'uploads', extractedPath)
    
    // Normaliser le chemin pour éviter les problèmes avec les séparateurs
    const normalizedPath = path.normalize(uploadsDir)
    
    // Sécurité: vérifier que le chemin ne sort pas du dossier uploads
    const uploadsBasePath = path.normalize(path.join(projectRoot, 'uploads'))
    if (!normalizedPath.startsWith(uploadsBasePath)) {
      logger.warn(`⚠️  Security: Path traversal attempt detected: ${normalizedPath}`)
      return response.status(403).json({
        status: 'error',
        message: 'Accès interdit',
        code: 'FORBIDDEN',
      })
    }
    
    console.log(`🔍 Looking for file at: ${normalizedPath}`)
    logger.debug(`Looking for file at: ${normalizedPath}`)
    
    // Vérifier que le fichier existe
    try {
      await fs.access(normalizedPath)
    } catch (accessError: any) {
      console.error(`❌ File not found: ${normalizedPath}`)
      logger.warn(`File not found: ${normalizedPath}`, { error: accessError?.message })
      return response.status(404).json({
        status: 'error',
        message: 'Fichier non trouvé',
        code: 'FILE_NOT_FOUND',
        path: normalizedPath,
        requested: extractedPath,
      })
    }
    
    // Lire le fichier
    const fileContent = await fs.readFile(normalizedPath)
    const ext = path.extname(normalizedPath).toLowerCase()
    
    // Déterminer le Content-Type selon l'extension
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
    }
    
    const contentType = mimeTypes[ext] || 'application/octet-stream'
    
    console.log(`✅ Serving file with Content-Type: ${contentType} (${fileContent.length} bytes)`)
    logger.info(`File served successfully: ${extractedPath} (${contentType})`)
    
    return response
      .header('Content-Type', contentType)
      .header('Cache-Control', 'public, max-age=31536000') // Cache 1 an
      .header('Access-Control-Allow-Origin', '*') // Permettre CORS pour les images
      .send(fileContent)
  } catch (error: any) {
    console.error(`❌ Error serving static file:`, error)
    logger.error('Error serving static file:', {
      error: error?.message || String(error),
      stack: error?.stack,
      url: request.url(),
    })
    return response.status(500).json({
      status: 'error',
      message: 'Erreur lors de la lecture du fichier',
      code: 'FILE_READ_ERROR',
      details: error?.message || String(error),
    })
  }
})

// Route pour WebSocket /notifications (sans /api)
// Cette route permet au WebSocket de fonctionner, mais retourne une erreur pour les requêtes HTTP normales
// Le middleware WebSocket intercepte les upgrades avant que cette route ne soit appelée
router.get('/notifications', async ({ request, response }) => {
  // Pour les requêtes HTTP normales, retourner une erreur indiquant d'utiliser /api/notifications
  return response.status(400).json({
    status: 'error',
    message: 'Cette route est réservée pour les connexions WebSocket. Utilisez /api/notifications pour les requêtes HTTP.',
    code: 'WEBSOCKET_ROUTE_ONLY',
  })
})

//Routes protégées par authentification
router
  .group(() => {
    router.post('logout', [LogoutController, 'logout'])
    router.resource('/properties', PropertiesController)
    router.get('/tenants', [PropertiesController, 'listTenants'])
    router.get('/properties/:id/applications', [ApplicationsController, 'index'])
    router.patch('/applications/:id/accept', [ApplicationsController, 'accept'])
    router.patch('/applications/:id/reject', [ApplicationsController, 'reject'])
    router.post('/applications/:id/create-contract', [ApplicationsController, 'createContract'])
    // Alias POST pour compat frontend
    router.post('/applications/:id/accept', [ApplicationsController, 'accept'])
    router.post('/applications/:id/reject', [ApplicationsController, 'reject'])
    router.resource('/contracts', ContractsController)
    router.post('/contracts/:id/pay-deposit', [ContractsController, 'payDeposit'])
    router.post('/properties/:id/apply', [ApplicationsController, 'apply'])
    // Routes pour les demandes de visite
    router.post('/properties/:id/visit-requests', [VisitRequestsController, 'store'])
    router.get('/properties/:id/visit-requests', [VisitRequestsController, 'index'])
    router.get('/visit-requests/me', [VisitRequestsController, 'myRequests'])
    router.patch('/visit-requests/:id/status', [VisitRequestsController, 'updateStatus'])
    router.delete('/visit-requests/:id', [VisitRequestsController, 'destroy'])
    // Routes pour les questions sur les propriétés
    router.post('/properties/:id/questions', [PropertyQuestionsController, 'store'])
    router.get('/properties/:id/questions', [PropertyQuestionsController, 'index'])
    router.patch('/properties/questions/:id/answer', [PropertyQuestionsController, 'answer'])
    router.get('/profile', [ProfilesController, 'show'])
    router.put('/profile', [ProfilesController, 'update'])
    router.post('/profile/add-role', [ProfilesController, 'addRole'])
    router.post('/payments', [PaymentsController, 'store'])
    router.get('/contracts/:id/payments', [PaymentsController, 'history'])
    router.post('/invites', [InvitesController, 'store'])
    // Routes pour les notifications
    router.get('/notifications', [NotificationsController, 'index'])
    router.put('/notifications/:id/read', [NotificationsController, 'markAsRead'])
    router.put('/notifications/read-all', [NotificationsController, 'markAllAsRead'])
    router.delete('/notifications/:id', [NotificationsController, 'destroy'])
    // Routes pour les factures
    router.get('/invoices', [InvoicesController, 'index'])
    router.get('/invoices/pending', [InvoicesController, 'pending'])
    router.get('/invoices/:id', [InvoicesController, 'show'])
    router.post('/invoices', [InvoicesController, 'store'])
    router.post('/invoices/:id/pay', [InvoicesController, 'pay'])
    router.put('/invoices/:id/cancel', [InvoicesController, 'cancel'])
    // Route pour le dashboard du bailleur
    router.get('/dashboard', [DashboardController, 'index'])
    // Routes pour les recherches (vues récentes et favoris)
    router.get('/search/recently-viewed', [SearchesController, 'recentlyViewed'])
    router.get('/search/favorites', [SearchesController, 'favorites'])
    router.post('/search/favorites/:propertyId', [SearchesController, 'addFavorite'])
    router.delete('/search/favorites/:propertyId', [SearchesController, 'removeFavorite'])
    router.get('/search/favorites/:propertyId/check', [SearchesController, 'checkFavorite'])
    // Routes pour les messages
    router.get('/conversations', [MessagesController, 'index'])
    router.get('/conversations/unread-count', [MessagesController, 'unreadCount'])
    router.get('/conversations/:id/messages', [MessagesController, 'getMessages'])
    router.post('/messages', [MessagesController, 'store'])
    router.patch('/messages/:id/read', [MessagesController, 'markAsRead'])
    // Routes pour les tokens FCM
    router.post('/fcm-tokens', [FcmTokensController, 'store'])
    router.get('/fcm-tokens', [FcmTokensController, 'index'])
    router.delete('/fcm-tokens/:token', [FcmTokensController, 'destroy'])
  })
  .prefix('/api')
  .middleware([middleware.auth()])

// Routes d'administration
router
  .group(() => {
    router.resource('/users', AdminUsersController).only(['index', 'show', 'update'])
  })
  .prefix('/api/admin')
  .middleware([middleware.auth()])

// Routes publiques (guest)
router
  .group(() => {
    // Route login avec rate limiting
    // Le middleware rateLimit utilise les valeurs par défaut (5 tentatives / 15 min)
    router.post('login', [LoginController, 'login']).use(middleware.rateLimit())
    router.post('register', [RegistersController, 'register'])
    router.post('forgot-password', [ForgotPasswordsController, 'requestReset'])
    router.post('reset-password', [ForgotPasswordsController, 'resetPassword'])
    router.get('public/properties', [PublicPropertiesController, 'index'])
    router.get('public/properties/:id', [PublicPropertiesController, 'show'])
    router.post('webhook/payment', [WebhooksController, 'payment'])
  })
  .prefix('/api')
