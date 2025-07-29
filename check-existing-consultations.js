const axios = require('axios');

const checkExistingConsultations = async () => {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2ODg0ZDZhYmMxY2ViMjAyY2E4MDY2YzQiLCJlbWFpbCI6ImNoYXlvcy5hbnNhcmlAdGVzdC5jb20iLCJyb2xlcyI6WyJwYXRpZW50Il0sInNlc3Npb25JZCI6IjRlY2Q1ZTZmMmQ4YTBmMjYyYTVmNDhmZWU3ZDg2MGIzNjcxZGNmMzhjMzFhNzFlYmVjNDdkODQxYWZiMjI1MzgiLCJpYXQiOjE3NTM2OTcyMjgsImV4cCI6MTc1MzY5ODEyOCwiYXVkIjoidGVuZGVybHktYXBpIiwiaXNzIjoidGVuZGVybHkuY2FyZSJ9.7dbKa7_I9TbyLvDWPN8Vn1h5gUrELc8aGmOhG-Ul6Bg';
  
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const patientId = '6884d6abc1ceb202ca8066c4';

  try {
    console.log('🔍 Checking existing consultations...\n');

    // Check for conflicts
    console.log('1️⃣ Checking consultation conflicts...');
    try {
      const conflictsResponse = await axios.get('http://localhost:3000/api/v1/consultations/conflicts', { headers });
      console.log('✅ Conflicts check:', conflictsResponse.data);
    } catch (conflictsError) {
      console.error('❌ Conflicts check failed:', conflictsError.response?.data);
    }

    // Get consultation stats
    console.log('\n2️⃣ Getting consultation stats...');
    try {
      const statsResponse = await axios.get('http://localhost:3000/api/v1/consultations/stats', { headers });
      console.log('✅ Consultation stats:', statsResponse.data);
    } catch (statsError) {
      console.error('❌ Stats check failed:', statsError.response?.data);
    }

    // Get active consultation
    console.log('\n3️⃣ Getting active consultation...');
    try {
      const activeResponse = await axios.get('http://localhost:3000/api/v1/consultations/active', { headers });
      console.log('✅ Active consultation:', activeResponse.data);
    } catch (activeError) {
      console.error('❌ Active consultation check failed:', activeError.response?.data);
    }

    // Get all consultations for patient
    console.log('\n4️⃣ Getting all consultations for patient...');
    try {
      const consultationsResponse = await axios.get(`http://localhost:3000/api/v1/consultations/patient/${patientId}`, { headers });
      console.log('✅ All consultations:', consultationsResponse.data);
    } catch (consultationsError) {
      console.error('❌ Consultations check failed:', consultationsError.response?.data);
    }

  } catch (error) {
    console.error('❌ General error:', error.message);
    if (error.response?.data) {
      console.error('Full error response:', JSON.stringify(error.response.data, null, 2));
    }
  }
};

checkExistingConsultations(); 