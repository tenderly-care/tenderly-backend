const axios = require('axios');

async function debugSessionPhase() {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2ODg0ZDZhYmMxY2ViMjAyY2E4MDY2YzQiLCJlbWFpbCI6ImNoYXlvcy5hbnNhcmlAdGVzdC5jb20iLCJyb2xlcyI6WyJwYXRpZW50Il0sInNlc3Npb25JZCI6ImIxY2FhZDgwMjI2NmU3MzE4NjUzNzQyYjFkNjFkZjdkMjAyYTU2MTVkNGZjN2JjZGE0YWQzMzVmYTczOTkxNTgiLCJpYXQiOjE3NTM1OTAzMTcsImV4cCI6MTc1MzU5MTIxNywiYXVkIjoidGVuZGVybHktYXBpIiwiaXNzIjoidGVuZGVybHkuY2FyZSJ9.SBCR4NrS7WUNG62XEDZpN7p1JjHxt3f-hEujTA96Pfc';
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  try {
    console.log('🔍 Step 1: Testing symptom collection...');
    const symptomResponse = await axios.post('http://localhost:3000/api/v1/consultations/symptoms/collect', {
      diagnosis_request: {
        symptoms: ['vaginal discharge', 'itching'],
        patient_age: 25,
        severity_level: 'moderate',
        duration: '3 days',
        onset: 'gradual',
        progression: 'stable'
      }
    }, { headers });
    console.log('✅ Symptom collection successful');
    console.log('Session ID:', symptomResponse.data.sessionId);

    console.log('\n🔍 Step 2: Testing consultation type selection...');
    const selectionResponse = await axios.post('http://localhost:3000/api/v1/consultations/select-consultation', {
      sessionId: symptomResponse.data.sessionId,
      selectedConsultationType: 'chat'
    }, { headers });
    console.log('✅ Consultation type selection successful');
    console.log('Payment ID:', selectionResponse.data.paymentDetails.paymentId);

    console.log('\n🔍 Step 3: Testing payment confirmation with detailed error...');
    try {
      const confirmResponse = await axios.post('http://localhost:3000/api/v1/consultations/confirm-payment', {
        sessionId: symptomResponse.data.sessionId,
        paymentId: selectionResponse.data.paymentDetails.paymentId
      }, { 
        headers,
        timeout: 15000 // 15 second timeout
      });
      console.log('✅ Payment confirmation successful:', confirmResponse.data);
    } catch (confirmError) {
      console.error('❌ Payment confirmation failed:');
      console.error('Status:', confirmError.response?.status);
      console.error('Data:', confirmError.response?.data);
      
      // Try to get more details about the session
      console.log('\n🔍 Step 4: Checking session details...');
      try {
        // Try to access the session directly through the cache
        const sessionCheckResponse = await axios.get(`http://localhost:3000/api/v1/consultations/sessions/${symptomResponse.data.sessionId}`, { headers });
        console.log('Session details:', sessionCheckResponse.data);
      } catch (sessionError) {
        console.log('Could not retrieve session details:', sessionError.response?.data || sessionError.message);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.status) {
      console.error('Status:', error.response.status);
    }
  }
}

debugSessionPhase(); 