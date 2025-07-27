const axios = require('axios');

async function testPaymentConfirmation() {
  try {
    // First, let's get a fresh token
    console.log('Getting fresh token...');
    const loginResponse = await axios.post('http://localhost:3000/api/v1/auth/login', {
      email: 'chayos.ansari@test.com',
      password: 'Test@123'
    });
    
    const token = loginResponse.data.accessToken;
    console.log('Token obtained:', token.substring(0, 50) + '...');
    
    // Now let's test the payment confirmation
    console.log('\nTesting payment confirmation...');
    const paymentResponse = await axios.post('http://localhost:3000/api/v1/consultations/confirm-payment', {
      sessionId: 'session_6885a7a3d7afd27f5dd18b32_1753589667452',
      paymentId: 'mock_pay_1753589728266_nkk1omm81'
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('Payment confirmation successful:', paymentResponse.data);
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Full error response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testPaymentConfirmation();
