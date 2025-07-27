const axios = require('axios');

async function debugSession() {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2ODg0ZDZhYmMxY2ViMjAyY2E4MDY2YzQiLCJlbWFpbCI6ImNoYXlvcy5hbnNhcmlAdGVzdC5jb20iLCJyb2xlcyI6WyJwYXRpZW50Il0sInNlc3Npb25JZCI6ImIxY2FhZDgwMjI2NmU3MzE4NjUzNzQyYjFkNjFkZjdkMjAyYTU2MTVkNGZjN2JjZGE0YWQzMzVmYTczOTkxNTgiLCJpYXQiOjE3NTM1OTAzMTcsImV4cCI6MTc1MzU5MTIxNywiYXVkIjoidGVuZGVybHktYXBpIiwiaXNzIjoidGVuZGVybHkuY2FyZSJ9.SBCR4NrS7WUNG62XEDZpN7p1JjHxt3f-hEujTA96Pfc';
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  try {
    console.log('🔍 Step 1: Testing symptom collection with correct format...');
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
    console.log('✅ Symptom collection successful:', symptomResponse.data);

    console.log('\n🔍 Step 2: Testing consultation type selection...');
    const selectionResponse = await axios.post('http://localhost:3000/api/v1/consultations/select-consultation', {
      sessionId: symptomResponse.data.sessionId,
      selectedConsultationType: 'chat'
    }, { headers });
    console.log('✅ Consultation type selection successful:', selectionResponse.data);

    console.log('\n🔍 Step 3: Testing payment confirmation with correct payment ID...');
    const confirmResponse = await axios.post('http://localhost:3000/api/v1/consultations/confirm-payment', {
      sessionId: symptomResponse.data.sessionId,
      paymentId: selectionResponse.data.paymentDetails.paymentId
    }, { headers });
    console.log('✅ Payment confirmation successful:', confirmResponse.data);

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.status) {
      console.error('Status:', error.response.status);
    }
  }
}

debugSession(); 