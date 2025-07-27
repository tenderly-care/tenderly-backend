const http = require('http');

// Test configuration
const config = {
  baseURL: 'http://localhost:3000/api/v1',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2ODg0ZDZhYmMxY2ViMjAyY2E4MDY2YzQiLCJlbWFpbCI6ImNoYXlvcy5hbnNhcmlAdGVzdC5jb20iLCJyb2xlcyI6WyJwYXRpZW50Il0sInNlc3Npb25JZCI6IjA4MjA5ZGFlNTNhZTQwNjQwY2Q1ZDI1ZDJkMjQ1ZDZhYTUzMmI5MjgyZmRlNjkwYmI0Mzk1YWE1ODMxNGNlY2MiLCJpYXQiOjE3NTM1MzYyNjksImV4cCI6MTc1MzUzNzE2OSwiYXVkIjoidGVuZGVybHktYXBpIiwiaXNzIjoidGVuZGVybHkuY2FyZSJ9.E-xsqhhEpnNG4kwKrsm_wAFMmhFDf_58ZfkLCtmQ4xs',
  sessionId: 'session_6884d739c1ceb202ca8066e8_1753536313472'
};

async function makeRequest(path, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(config.baseURL + path);
    const options = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function testDirectPaymentConfirmation() {
  console.log('🧪 Testing direct payment confirmation...\n');

  try {
    // First, let's check if we need to select consultation type first
    console.log('🎯 Step 1: Selecting consultation type...');
    const consultationData = {
      sessionId: config.sessionId,
      selectedConsultationType: 'chat',
      preferences: {
        urgency: 'normal',
        additionalNotes: 'Direct test consultation'
      }
    };

    const consultationResult = await makeRequest('/consultations/select-consultation', 'POST', consultationData);
    console.log(`Status: ${consultationResult.status}`);
    
    if (consultationResult.status !== 200 && consultationResult.status !== 201) {
      console.error('❌ Consultation selection failed:', consultationResult.data);
      return;
    }

    const paymentId = consultationResult.data.paymentDetails.paymentId;
    console.log(`✅ Consultation type selected. Payment ID: ${paymentId}\n`);

    // Step 2: Confirm payment
    console.log('💳 Step 2: Confirming payment...');
    const paymentData = {
      sessionId: config.sessionId,
      paymentId: paymentId
    };

    const paymentResult = await makeRequest('/consultations/confirm-payment', 'POST', paymentData);
    console.log(`Status: ${paymentResult.status}`);
    console.log('Response:', JSON.stringify(paymentResult.data, null, 2));

    if (paymentResult.status === 200 || paymentResult.status === 201) {
      console.log('\n🎉 Payment confirmation completed successfully!');
      
      // Show consultation details
      if (paymentResult.data.consultation) {
        console.log('\n📋 Consultation Details:');
        console.log('- ID:', paymentResult.data.consultation._id);
        console.log('- Status:', paymentResult.data.consultation.status);
        console.log('- Type:', paymentResult.data.consultation.consultationType);
        console.log('- Session ID:', paymentResult.data.consultation.session_id);
      }
    } else {
      console.log('\n❌ Payment confirmation failed');
      
      // Additional debugging info
      if (paymentResult.data && paymentResult.data.error) {
        console.log('Error details:', paymentResult.data.error);
        console.log('Transaction ID:', paymentResult.data.transactionId);
      }
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run the test
testDirectPaymentConfirmation();
