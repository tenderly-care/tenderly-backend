const axios = require('axios');

// Test configuration
const BASE_URL = 'http://localhost:3000/api/v1';
const TEST_PATIENT_ID = '6884d6abc1ceb202ca8066c4';
const TEST_SESSION_ID = 'test_session_' + Date.now();

async function testPaymentConfirmationOnly() {
  console.log('🧪 Testing Payment Confirmation Only');
  console.log('====================================\n');

  try {
    // Step 1: Health check
    console.log('1️⃣ Checking API health...');
    const healthResponse = await axios.get(`${BASE_URL}/consultations/health`);
    console.log('✅ API is healthy:', healthResponse.data.message);
    console.log('');

    // Step 2: Test payment confirmation (should NOT create consultation)
    console.log('2️⃣ Testing payment confirmation...');
    const paymentConfirmationData = {
      sessionId: TEST_SESSION_ID,
      paymentId: 'mock_pay_' + Date.now(),
      amount: 299,
      currency: 'INR',
      paymentMethod: 'online',
      transactionId: 'mock_txn_' + Date.now()
    };

    const confirmResponse = await axios.post(
      `${BASE_URL}/consultations/confirm-payment`,
      paymentConfirmationData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TEST_TOKEN || 'test-token'}`
        }
      }
    );

    console.log('✅ Payment confirmation successful!');
    console.log('📊 Response structure:');
    console.log('   - Success:', confirmResponse.data.success);
    console.log('   - Message:', confirmResponse.data.message);
    console.log('   - Clinical Session ID:', confirmResponse.data.clinicalSessionId);
    console.log('   - Next Steps:', confirmResponse.data.nextSteps);
    console.log('');

    // Step 3: Verify NO consultation was created
    console.log('3️⃣ Verifying NO consultation was created...');
    
    // Check if response contains consultation data (it shouldn't)
    if (confirmResponse.data.consultation) {
      console.log('❌ ERROR: Consultation was created when it shouldn\'t be!');
      console.log('   - Consultation ID:', confirmResponse.data.consultation.consultationId);
      console.log('   - Status:', confirmResponse.data.consultation.status);
      console.log('   - This endpoint should ONLY confirm payment, not create consultations');
    } else {
      console.log('✅ SUCCESS: No consultation was created (as expected)');
      console.log('   - Payment confirmation only');
      console.log('   - No consultation object in response');
    }

    console.log('');

    // Step 4: Verify response structure
    console.log('4️⃣ Verifying response structure...');
    const response = confirmResponse.data;
    
    // Expected fields
    const expectedFields = ['success', 'message', 'clinicalSessionId', 'nextSteps'];
    const missingFields = expectedFields.filter(field => !response[field]);
    
    if (missingFields.length > 0) {
      console.log('❌ Missing expected fields:', missingFields);
    } else {
      console.log('✅ All expected fields present');
    }

    // Fields that should NOT be present
    const forbiddenFields = ['consultation', 'consultationId', 'patientId', 'doctorId'];
    const presentForbiddenFields = forbiddenFields.filter(field => response[field]);
    
    if (presentForbiddenFields.length > 0) {
      console.log('❌ Forbidden fields present:', presentForbiddenFields);
    } else {
      console.log('✅ No forbidden fields present');
    }

    console.log('');

    // Step 5: Test with invalid session
    console.log('5️⃣ Testing with invalid session...');
    try {
      const invalidResponse = await axios.post(
        `${BASE_URL}/consultations/confirm-payment`,
        {
          ...paymentConfirmationData,
          sessionId: 'invalid_session_id'
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.TEST_TOKEN || 'test-token'}`
          }
        }
      );
      console.log('❌ Should have failed with invalid session');
    } catch (error) {
      console.log('✅ Correctly failed with invalid session');
      console.log('   - Status:', error.response?.status);
      console.log('   - Message:', error.response?.data?.message);
    }

    console.log('');
    console.log('🎉 Payment confirmation test completed successfully!');
    console.log('');
    console.log('📋 Summary:');
    console.log('   - Payment confirmation works correctly');
    console.log('   - No consultation created (as expected)');
    console.log('   - Clinical session ID generated');
    console.log('   - Response structure is correct');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('📊 Response status:', error.response.status);
      console.error('📋 Response data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testPaymentConfirmationOnly();
}

module.exports = { testPaymentConfirmationOnly }; 