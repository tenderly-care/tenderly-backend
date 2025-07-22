const axios = require('axios');
const jwt = require('jsonwebtoken');

const API_BASE_URL = 'http://localhost:3000/api/v1';
const JWT_SECRET = 'your-super-secret-jwt-key-change-in-production-min-32-chars';

// Generate a valid JWT token
function generateToken(userId, email, roles = ['patient']) {
  const payload = {
    sub: userId,
    email: email,
    roles: roles,
    sessionId: '785582dbd480a457b75692b0fffb79074a7b8971d3256e6bc57605d63040aeaa',
    iat: Math.floor(Date.now() / 1000),
    aud: 'tenderly-api',
    iss: 'tenderly.care'
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '2h' });
  
  // Debug: Verify the token can be decoded
  console.log('🔍 Token payload:', payload);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('✅ Token verified successfully');
    console.log('📋 Decoded token:', decoded);
  } catch (err) {
    console.error('❌ Token verification failed:', err.message);
  }
  
  return token;
}

async function testPaymentConfirmation() {
  try {
    console.log('🧪 Testing Production-Ready Payment Confirmation Flow');
    console.log('================================================');
    
    // Test data
    const sessionId = 'symptoms_68738db57e71f5951addafd5_1752649932269';
    const paymentId = 'mock_pay_1752650058712_k404q6wv9';
    const userId = '68738db57e71f5951addafd5';
    const email = 'asharansari@test.com';
    
    // Generate token
    const token = generateToken(userId, email);
    console.log('✅ JWT token generated successfully');
    
    // Test payment confirmation
    const paymentConfirmationData = {
      sessionId: sessionId,
      paymentId: paymentId
    };
    
    console.log('📋 Payment confirmation request:');
    console.log(JSON.stringify(paymentConfirmationData, null, 2));
    
    const response = await axios.post(`${API_BASE_URL}/consultations/confirm-payment`, 
      paymentConfirmationData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Payment confirmation successful!');
    console.log('📊 Response:');
    console.log(JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Payment confirmation failed:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Run the test
testPaymentConfirmation();
