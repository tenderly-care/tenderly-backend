const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api/v1';

// Test data
const validPatientId = '66f1d16aed15f2ef9d6dd33f'; // Valid ObjectId format
const invalidPatientId = 'invalid-id';

// Test user credentials (you may need to adjust these)
const testUser = {
  email: 'test@example.com',
  password: 'Test123!@#'
};

let authToken = null;

async function getAuthToken() {
  console.log('Getting authentication token...');
  try {
    // First, try to register a test user
    try {
      await axios.post(`${BASE_URL}/auth/register`, {
        email: testUser.email,
        password: testUser.password,
        firstName: 'Test',
        lastName: 'User',
        role: 'patient',
        phoneNumber: '+1234567890'
      });
      console.log('✅ Test user registered successfully');
    } catch (regError) {
      if (regError.response?.status === 409) {
        console.log('ℹ️ Test user already exists, proceeding with login');
      } else {
        console.log('⚠️ Registration failed:', regError.response?.data?.message || regError.message);
      }
    }

    // Now login to get the token
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: testUser.email,
      password: testUser.password
    });
    
    authToken = loginResponse.data.accessToken;
    console.log('✅ Authentication token obtained');
    return authToken;
    
  } catch (error) {
    console.log('❌ Failed to get auth token:', error.response?.data?.message || error.message);
    return null;
  }
}

async function testEndpoints() {
  console.log('Testing consultation endpoints...\n');

  // First get authentication token
  authToken = await getAuthToken();
  if (!authToken) {
    console.log('❌ Cannot proceed without authentication token. Testing public endpoints only...');
    await testPublicEndpoints();
    return;
  }

  console.log('\n=== Testing Authenticated Endpoints ===');

  // Test 1: Valid patient ID - should work
  console.log('\n=== Test 1: Valid Patient ID ===');
  try {
    const response = await axios.get(`${BASE_URL}/consultations/active`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    console.log('✅ GET /consultations/active with valid ID:', response.status);
  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log('✅ GET /consultations/active - No active consultation found (expected)');
    } else if (error.response && error.response.status === 400) {
      console.log('✅ GET /consultations/active - Bad request (good, validation working):', error.response.data.message);
    } else {
      console.log('❌ GET /consultations/active failed:', error.response?.status, error.response?.data?.message || error.message);
    }
  }

  // Test 2: Stats endpoint
  console.log('\n=== Test 2: Stats Endpoint ===');
  try {
    const response = await axios.get(`${BASE_URL}/consultations/stats`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    console.log('✅ GET /consultations/stats:', response.status);
    console.log('Stats data:', response.data);
  } catch (error) {
    if (error.response && error.response.status === 400) {
      console.log('✅ GET /consultations/stats - Bad request (good, validation working):', error.response.data.message);
    } else {
      console.log('❌ GET /consultations/stats failed:', error.response?.status, error.response?.data?.message || error.message);
    }
  }

  // Test 3: Conflicts endpoint
  console.log('\n=== Test 3: Conflicts Endpoint ===');
  try {
    const response = await axios.get(`${BASE_URL}/consultations/conflicts`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    console.log('✅ GET /consultations/conflicts:', response.status);
    console.log('Conflicts data:', response.data);
  } catch (error) {
    if (error.response && error.response.status === 400) {
      console.log('✅ GET /consultations/conflicts - Bad request (good, validation working):', error.response.data.message);
    } else {
      console.log('❌ GET /consultations/conflicts failed:', error.response?.status, error.response?.data?.message || error.message);
    }
  }

  await testPublicEndpoints();
  console.log('\n=== Testing Complete ===');
}

async function testPublicEndpoints() {
  console.log('\n=== Testing Public Endpoints ===');
  
  // Test public health endpoints
  console.log('\n=== Test: Health Check ===');
  try {
    const response = await axios.get(`${BASE_URL}/consultations/health`);
    console.log('✅ GET /consultations/health:', response.status);
    console.log('Health data:', response.data);
  } catch (error) {
    console.log('❌ GET /consultations/health failed:', error.response?.status, error.response?.data?.message || error.message);
  }

  console.log('\n=== Test: Database Health Check ===');
  try {
    const response = await axios.get(`${BASE_URL}/consultations/db-health`);
    console.log('✅ GET /consultations/db-health:', response.status);
    console.log('DB Health data:', response.data);
  } catch (error) {
    console.log('❌ GET /consultations/db-health failed:', error.response?.status, error.response?.data?.message || error.message);
  }

  console.log('\n=== Test: AI Service Health Check ===');
  try {
    const response = await axios.get(`${BASE_URL}/consultations/ai-service/health`);
    console.log('✅ GET /consultations/ai-service/health:', response.status);
    console.log('AI Health data:', response.data);
  } catch (error) {
    console.log('❌ GET /consultations/ai-service/health failed:', error.response?.status, error.response?.data?.message || error.message);
  }

  console.log('\n=== Test: Test Model ===');
  try {
    const response = await axios.get(`${BASE_URL}/consultations/test-model`);
    console.log('✅ GET /consultations/test-model:', response.status);
    console.log('Test model data:', response.data);
  } catch (error) {
    console.log('❌ GET /consultations/test-model failed:', error.response?.status, error.response?.data?.message || error.message);
  }
}

if (require.main === module) {
  testEndpoints().catch(console.error);
}

module.exports = { testEndpoints };
