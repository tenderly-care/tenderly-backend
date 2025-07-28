const axios = require('axios');

async function testEndpoint() {
  console.log('🧪 Testing detailed symptoms collection endpoint...\n');
  
  try {
    // Wait a moment for server to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test simple payload
    const testPayload = {
      "detailedSymptoms": {
        "primaryComplaint": "pelvic pain"
      },
      "medicalContext": {
        "allergies": []
      }
    };
    
    console.log('📤 Sending test request...');
    console.log('Payload:', JSON.stringify(testPayload, null, 2));
    
    const response = await axios.post(
      'http://localhost:3000/api/v1/consultations/symptoms/collect_detailed_symptoms',
      testPayload,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );
    
    console.log('✅ Success! Status:', response.status);
    console.log('📋 Response data:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Test failed:');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
      console.error('Headers:', error.response.headers);
    } else if (error.request) {
      console.error('No response received:', error.message);
    } else {
      console.error('Error:', error.message);
    }
    
    console.error('Full error:', error);
  }
}

testEndpoint();
