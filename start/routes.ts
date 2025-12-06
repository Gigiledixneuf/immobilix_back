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
const InvitesController = () => import('#controllers/invites_controller')
const PublicPropertiesController = () => import('#controllers/Public/properties_controller')
const ProfilesController = () => import('#controllers/profiles_controller')
const AdminUsersController = () => import('#controllers/Admin/users_controller')
const LoginController = () => import('#controllers/Auth/login_controller')
const RegistersController = () => import('#controllers/Auth/registers_controller')
const NotificationsController = () => import('#controllers/notifications_controller')
const InvoicesController = () => import('#controllers/invoices_controller')
const DashboardController = () => import('#controllers/Bailleur/dashboard_controller')

router.get('/', async () => {
  return {
    hello: 'world',
  }
})

//Routes protégées par authentification
router
  .group(() => {
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
    router.get('/profile', [ProfilesController, 'show'])
    router.put('/profile', [ProfilesController, 'update'])
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
    router.post('login', [LoginController, 'login'])
    router.post('register', [RegistersController, 'register'])
    router.get('public/properties', [PublicPropertiesController, 'index'])
    router.get('public/properties/:id', [PublicPropertiesController, 'show'])
    router.post('webhook/payment', [WebhooksController, 'payment'])
  })
  .prefix('/api')

// Route pour servir les fichiers statiques (images uploadées)
router.get('/uploads/*', async ({ request, response }) => {
  const fs = await import('node:fs/promises')
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  
  try {
    // Récupérer le chemin du fichier demandé
    const filePath = request.param('*')
    const appRoot = new URL('../../', import.meta.url)
    const uploadsDir = path.join(fileURLToPath(appRoot), 'uploads', filePath)
    
    // Vérifier que le fichier existe
    try {
      await fs.access(uploadsDir)
    } catch {
      return response.status(404).json({
        status: 'error',
        message: 'Fichier non trouvé',
        code: 'FILE_NOT_FOUND',
      })
    }
    
    // Lire le fichier
    const fileContent = await fs.readFile(uploadsDir)
    const ext = path.extname(uploadsDir).toLowerCase()
    
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
    
    return response
      .header('Content-Type', contentType)
      .header('Cache-Control', 'public, max-age=31536000') // Cache 1 an
      .send(fileContent)
  } catch (error) {
    return response.status(500).json({
      status: 'error',
      message: 'Erreur lors de la lecture du fichier',
      code: 'FILE_READ_ERROR',
    })
  }
})
