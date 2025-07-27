const http = require('http');

// Test configuration
const config = {
  baseURL: 'http://localhost:3000/api/v1',
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2ODg0ZDZhYmMxY2ViMjAyY2E4MDY2YzQiLCJlbWFpbCI6ImNoYXlvcy5hbnNhcmlAdGVzdC5jb20iLCJyb2xlcyI6WyJwYXRpZW50Il0sInNlc3Npb25JZCI6IjQwNDgzMjEyYTYzOWMxOTEzZDBmOTdkOGE0ZWNmMGQ3OGJiMWMxODk5ZTdmMzBkNjU3MDgwMTY0N2JjZGEyNDIiLCJpYXQiOjE3NTM1MzY2OTAsImV4cCI6MTc1MzUzNzU5MCwiYXVkIjoidGVuZGVybHktYXBpIiwiaXNzIjoidGVuZGVybHkuY2FyZSJ9.TTn7Hz0aKZ0zE5J2NKBCnmF2Lj508sS-ls_AHWu_AYI',
  sessionId: 'session_6884d739c1ceb202ca8066e8_1753536313472',
  paymentId: 'mock_pay_1753536340355_l88lcvo4n'
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

async function testPaymentConfirmationOnly() {
  console.log('🧪 Testing payment confirmation directly...\n');

  try {
    // Since the session is in payment_pending phase, we can directly confirm payment
    // We need to use a mock payment ID for this test
    console.log('💳 Confirming payment...');
    const paymentData = {
      sessionId: config.sessionId,
      paymentId: config.paymentId // Use the correct payment ID from the session
    };

    console.log('Payment data:', JSON.stringify(paymentData, null, 2));

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
        console.log('- Patient ID:', paymentResult.data.consultation.patientId);
        
        if (paymentResult.data.consultation.paymentInfo) {
          console.log('\n💰 Payment Info:');
          console.log('- Payment ID:', paymentResult.data.consultation.paymentInfo.paymentId);
          console.log('- Amount:', paymentResult.data.consultation.paymentInfo.amount);
          console.log('- Currency:', paymentResult.data.consultation.paymentInfo.currency);
          console.log('- Status:', paymentResult.data.consultation.paymentInfo.paymentStatus);
        }

        if (paymentResult.data.consultation.aiDiagnosis) {
          console.log('\n🤖 AI Diagnosis:');
          console.log('- Diagnoses:', paymentResult.data.consultation.aiDiagnosis.possible_diagnoses);
          console.log('- Confidence:', paymentResult.data.consultation.aiDiagnosis.confidence_score);
        }
      }
    } else {
      console.log('\n❌ Payment confirmation failed');
      
      // Additional debugging info
      if (paymentResult.data && paymentResult.data.error) {
        console.log('Error details:', paymentResult.data.error);
        console.log('Transaction ID:', paymentResult.data.transactionId);
        console.log('Message:', paymentResult.data.message);
      }
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
  }
}

// Run the test
testPaymentConfirmationOnly();
