const axios = require('axios');

async function testSimpleConsultation() {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2ODg0ZDZhYmMxY2ViMjAyY2E4MDY2YzQiLCJlbWFpbCI6ImNoYXlvcy5hbnNhcmlAdGVzdC5jb20iLCJyb2xlcyI6WyJwYXRpZW50Il0sInNlc3Npb25JZCI6ImIxY2FhZDgwMjI2NmU3MzE4NjUzNzQyYjFkNjFkZjdkMjAyYTU2MTVkNGZjN2JjZGE0YWQzMzVmYTczOTkxNTgiLCJpYXQiOjE3NTM1OTAzMTcsImV4cCI6MTc1MzU5MTIxNywiYXVkIjoidGVuZGVybHktYXBpIiwiaXNzIjoidGVuZGVybHkuY2FyZSJ9.SBCR4NrS7WUNG62XEDZpN7p1JjHxt3f-hEujTA96Pfc';
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  try {
    console.log('🔍 Testing consultation creation with minimal data...');
    
    // Use a simple ObjectId string for session_id
    const simpleSessionId = '507f1f77bcf86cd799439011'; // Valid ObjectId
    
    const consultationData = {
      patientId: '6884d6abc1ceb202ca8066c4',
      session_id: simpleSessionId,
      consultationType: 'chat'
      // Remove all optional fields to minimize validation issues
    };

    console.log('Minimal consultation data:', JSON.stringify(consultationData, null, 2));
    
    const response = await axios.post('http://localhost:3000/api/v1/consultations', consultationData, { headers });
    console.log('✅ Consultation creation successful:', response.data);

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.status) {
      console.error('Status:', error.response.status);
    }
  }
}

testSimpleConsultation(); 