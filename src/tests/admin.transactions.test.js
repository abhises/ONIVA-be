const request = require('supertest');
const app = require('../app');
const { query } = require('../config/database');
const jwt = require('jsonwebtoken');

// Mock the database query function
jest.mock('../config/database', () => ({
  query: jest.fn(),
  connectDatabase: jest.fn(),
  getPool: jest.fn(),
  transaction: jest.fn()
}));

// Helper to create a fake admin token
const createAdminToken = (id = 1) => {
  return jwt.sign({ id, role: 'admin' }, process.env.JWT_SECRET || 'test_secret', { expiresIn: '1h' });
};

const createClientToken = (id = 2) => {
  return jwt.sign({ id, role: 'client' }, process.env.JWT_SECRET || 'test_secret', { expiresIn: '1h' });
};

describe('GET /api/admin/transactions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- EDGE CASE 1: Unauthorized Access (No Token) ---
  it('should return 401 if no token is provided', async () => {
    const res = await request(app).get('/api/admin/transactions');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // --- EDGE CASE 2: Non-Admin Access ---
  it('should return 403 (or 401 if not checked properly yet) if user is not an admin', async () => {
    // Note: If the backend only checks authentication but not role in this route, this might fail.
    // Let's see if our middleware handles roles.
    const token = createClientToken();
    const res = await request(app)
      .get('/api/admin/transactions')
      .set('Authorization', `Bearer ${token}`);
    
    // Most apps return 403 for Forbidden role
    expect(res.status).toBe(403); 
  });

  // --- EDGE CASE 3: Successful Fetch with Summary ---
  it('should return data and summary for a valid admin request', async () => {
    const token = createAdminToken();

    // ORDER MUST MATCH controller: Count -> Summary -> Data -> Pricing
    
    // 1. Mock response for total count query
    query.mockResolvedValueOnce({ rows: [{ total: 1 }] });
    // 2. Mock response for summary query
    query.mockResolvedValueOnce({ 
      rows: [{ total_revenue: 5000, total_commission: 1250, total_driver_earnings: 3750, count: 1 }] 
    });
    // 3. Mock response for main transactions query
    query.mockResolvedValueOnce({ rows: [{ id: 101, status: 'completed', total_price: 5000 }] });
    // 4. Mock response for active pricing config
    query.mockResolvedValueOnce({ rows: [{ commission_percentage: 25 }] });

    const res = await request(app)
      .get('/api/admin/transactions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.summary.activeCommission).toBe(25);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].id).toBe(101);
  });

  // --- EDGE CASE 4: Invalid Date Format ---
  it('should handle malformed date filters gracefully', async () => {
    const token = createAdminToken();

    // 1. Count
    query.mockResolvedValueOnce({ rows: [{ total: 0 }] }); 
    // 2. Summary
    query.mockResolvedValueOnce({ rows: [] }); 
    // 3. Data
    query.mockResolvedValueOnce({ rows: [] }); 
    // 4. Pricing
    query.mockResolvedValueOnce({ rows: [{ commission_percentage: 25 }] });

    const res = await request(app)
      .get('/api/admin/transactions?startDate=not-a-date')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.summary.totalRevenue).toBe(0);
  });

  // --- EDGE CASE 5: Database Error ---
  it('should return 500 if database query fails', async () => {
    const token = createAdminToken();
    query.mockRejectedValueOnce(new Error('Database error'));

    const res = await request(app)
      .get('/api/admin/transactions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});
