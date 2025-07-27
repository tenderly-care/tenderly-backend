const axios = require('axios');

async function debugPaymentConfirmation() {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2ODg0ZDZhYmMxY2ViMjAyY2E4MDY2YzQiLCJlbWFpbCI6ImNoYXlvcy5hbnNhcmlAdGVzdC5jb20iLCJyb2xlcyI6WyJwYXRpZW50Il0sInNlc3Npb25JZCI6ImIxY2FhZDgwMjI2NmU3MzE4NjUzNzQyYjFkNjFkZjdkMjAyYTU2MTVkNGZjN2JjZGE0YWQzMzVmYTczOTkxNTgiLCJpYXQiOjE3NTM1OTAzMTcsImV4cCI6MTc1MzU5MTIxNywiYXVkIjoidGVuZGVybHktYXBpIiwiaXNzIjoidGVuZGVybHkuY2FyZSJ9.SBCR4NrS7WUNG62XEDZpN7p1JjHxt3f-hEujTA96Pfc';
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  try {
    console.log('🔍 Step 1: Testing health check...');
    const healthResponse = await axios.get('http://localhost:3000/api/v1/consultations/health');
    console.log('✅ Health check successful:', healthResponse.data);

    console.log('\n🔍 Step 2: Testing AI service health...');
    const aiHealthResponse = await axios.get('http://localhost:3000/api/v1/consultations/ai-health');
    console.log('✅ AI health check successful:', aiHealthResponse.data);

    console.log('\n🔍 Step 3: Testing payment confirmation with detailed error...');
    try {
      const confirmResponse = await axios.post('http://localhost:3000/api/v1/consultations/confirm-payment', {
        sessionId: 'session_6885a7a3d7afd27f5dd18b32_1753589667452',
        paymentId: 'mock_pay_1753589728266_nkk1omm81'
      }, { 
        headers,
        timeout: 10000 // 10 second timeout
      });
      console.log('✅ Payment confirmation successful:', confirmResponse.data);
    } catch (confirmError) {
      console.error('❌ Payment confirmation failed:');
      console.error('Status:', confirmError.response?.status);
      console.error('Data:', confirmError.response?.data);
      console.error('Headers:', confirmError.response?.headers);
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.status) {
      console.error('Status:', error.response.status);
    }
  }
}

debugPaymentConfirmation(); 