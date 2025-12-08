import { test } from '@japa/runner'
import testUtils from '@adonisjs/core/services/test_utils'
import { ApiClient } from '@japa/api-client'

test.group('Visit Requests API', (group) => {
  let client: ApiClient
  let authToken: string
  let propertyId: number
  let visitRequestId: number

  group.setup(async () => {
    await testUtils.db().migrate()
    client = testUtils.apiClient()
  })

  group.teardown(async () => {
    await testUtils.db().truncate()
  })

  test('1. Login to get auth token', async ({ assert }) => {
    const response = await client.post('/api/login').json({
      email: 'locataire1@example.com',
      password: 'password123',
    })

    response.assertStatus(200)
    const body = response.body()
    assert.exists(body.data.accessToken)
    authToken = body.data.accessToken
  })

  test('2. Get a property ID for testing', async ({ assert }) => {
    const response = await client
      .get('/api/public/properties')
      .qs({ page: 1, limit: 1 })

    response.assertStatus(200)
    const body = response.body()
    assert.exists(body.data)
    assert.isArray(body.data)
    if (body.data.length > 0) {
      propertyId = body.data[0].id
      assert.isNumber(propertyId)
    } else {
      assert.fail('No properties available for testing')
    }
  })

  test('3. Create a visit request', async ({ assert }) => {
    // Date de demain
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const requestedDate = tomorrow.toISOString().split('T')[0] // YYYY-MM-DD

    const response = await client
      .post(`/api/properties/${propertyId}/visit-requests`)
      .header('Authorization', `Bearer ${authToken}`)
      .json({
        requested_date: requestedDate,
        requested_time: '14:30',
        message: 'Je souhaite visiter cette propriété',
      })

    response.assertStatus(201)
    const body = response.body()
    assert.exists(body.data)
    assert.equal(body.data.status, 'pending')
    assert.equal(body.data.propertyId, propertyId)
    assert.equal(body.data.requestedTime, '14:30:00')
    visitRequestId = body.data.id
  })

  test('4. Get my visit requests', async ({ assert }) => {
    const response = await client
      .get('/api/visit-requests/me')
      .header('Authorization', `Bearer ${authToken}`)

    response.assertStatus(200)
    const body = response.body()
    assert.exists(body.data)
    assert.isArray(body.data)
    assert.isAtLeast(body.data.length, 1)
    
    const visitRequest = body.data.find((vr: any) => vr.id === visitRequestId)
    assert.exists(visitRequest)
    assert.equal(visitRequest.status, 'pending')
  })

  test('5. Login as landlord to get visit requests for property', async ({ assert }) => {
    // Login as bailleur
    const loginResponse = await client.post('/api/login').json({
      email: 'bailleur1@example.com',
      password: 'password123',
    })

    loginResponse.assertStatus(200)
    const landlordToken = loginResponse.body().data.accessToken

    const response = await client
      .get(`/api/properties/${propertyId}/visit-requests`)
      .header('Authorization', `Bearer ${landlordToken}`)

    response.assertStatus(200)
    const body = response.body()
    assert.exists(body.data)
    assert.isArray(body.data)
    assert.isAtLeast(body.data.length, 1)
  })

  test('6. Accept visit request (as landlord)', async ({ assert }) => {
    // Login as bailleur
    const loginResponse = await client.post('/api/login').json({
      email: 'bailleur1@example.com',
      password: 'password123',
    })

    loginResponse.assertStatus(200)
    const landlordToken = loginResponse.body().data.accessToken

    // Date/heure confirmée
    const scheduledAt = new Date()
    scheduledAt.setDate(scheduledAt.getDate() + 1)
    scheduledAt.setHours(14, 30, 0, 0)

    const response = await client
      .patch(`/api/visit-requests/${visitRequestId}/status`)
      .header('Authorization', `Bearer ${landlordToken}`)
      .json({
        status: 'accepted',
        scheduled_at: scheduledAt.toISOString(),
      })

    response.assertStatus(200)
    const body = response.body()
    assert.exists(body.data)
    assert.equal(body.data.status, 'accepted')
    assert.exists(body.data.scheduledAt)
  })

  test('7. Verify visit request status is updated', async ({ assert }) => {
    // Login as tenant to verify
    const loginResponse = await client.post('/api/login').json({
      email: 'locataire1@example.com',
      password: 'password123',
    })

    loginResponse.assertStatus(200)
    const tenantToken = loginResponse.body().data.accessToken

    const response = await client
      .get('/api/visit-requests/me')
      .header('Authorization', `Bearer ${tenantToken}`)

    response.assertStatus(200)
    const body = response.body()
    const visitRequest = body.data.find((vr: any) => vr.id === visitRequestId)
    assert.exists(visitRequest)
    assert.equal(visitRequest.status, 'accepted')
  })

  test('8. Reject a visit request (as landlord)', async ({ assert }) => {
    // Create another visit request
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 2)
    const requestedDate = tomorrow.toISOString().split('T')[0]

    const createResponse = await client
      .post(`/api/properties/${propertyId}/visit-requests`)
      .header('Authorization', `Bearer ${authToken}`)
      .json({
        requested_date: requestedDate,
        requested_time: '16:00',
        message: 'Deuxième demande de visite',
      })

    createResponse.assertStatus(201)
    const newVisitRequestId = createResponse.body().data.id

    // Login as bailleur
    const loginResponse = await client.post('/api/login').json({
      email: 'bailleur1@example.com',
      password: 'password123',
    })

    loginResponse.assertStatus(200)
    const landlordToken = loginResponse.body().data.accessToken

    const response = await client
      .patch(`/api/visit-requests/${newVisitRequestId}/status`)
      .header('Authorization', `Bearer ${landlordToken}`)
      .json({
        status: 'rejected',
      })

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.data.status, 'rejected')
  })

  test('9. Cancel a visit request (as tenant)', async ({ assert }) => {
    // Create a new visit request
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 3)
    const requestedDate = tomorrow.toISOString().split('T')[0]

    const createResponse = await client
      .post(`/api/properties/${propertyId}/visit-requests`)
      .header('Authorization', `Bearer ${authToken}`)
      .json({
        requested_date: requestedDate,
        requested_time: '10:00',
        message: 'Visite à annuler',
      })

    createResponse.assertStatus(201)
    const cancelVisitRequestId = createResponse.body().data.id

    // Cancel it
    const response = await client
      .delete(`/api/visit-requests/${cancelVisitRequestId}`)
      .header('Authorization', `Bearer ${authToken}`)

    response.assertStatus(200)
    const body = response.body()
    assert.equal(body.status, 'success')
  })

  test('10. Validation: cannot create visit request with past date', async ({ assert }) => {
    // Date d'hier
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const requestedDate = yesterday.toISOString().split('T')[0]

    const response = await client
      .post(`/api/properties/${propertyId}/visit-requests`)
      .header('Authorization', `Bearer ${authToken}`)
      .json({
        requested_date: requestedDate,
        requested_time: '14:30',
      })

    response.assertStatus(400)
    const body = response.body()
    assert.exists(body.message)
  })

  test('11. Validation: cannot create duplicate visit request', async ({ assert }) => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 4)
    const requestedDate = tomorrow.toISOString().split('T')[0]

    // Create first request
    const firstResponse = await client
      .post(`/api/properties/${propertyId}/visit-requests`)
      .header('Authorization', `Bearer ${authToken}`)
      .json({
        requested_date: requestedDate,
        requested_time: '15:00',
      })

    firstResponse.assertStatus(201)

    // Try to create duplicate
    const duplicateResponse = await client
      .post(`/api/properties/${propertyId}/visit-requests`)
      .header('Authorization', `Bearer ${authToken}`)
      .json({
        requested_date: requestedDate,
        requested_time: '15:00',
      })

    duplicateResponse.assertStatus(400)
    const body = duplicateResponse.body()
    assert.exists(body.message)
  })
})
