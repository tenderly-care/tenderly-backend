#!/usr/bin/env node

/**
 * Simple test script for Doctor Profile Management API
 * Usage: node test-doctor-profile.js
 */

const BASE_URL = 'http://localhost:3001/api/v1';

// Test cases for the doctor profile API
const testCases = [
  {
    name: 'Get Doctor Profile',
    method: 'GET',
    endpoint: '/doctor-profile/USER_ID_HERE',
    headers: {
      'Authorization': 'Bearer YOUR_JWT_TOKEN_HERE',
      'Content-Type': 'application/json'
    }
  },
  {
    name: 'Update Professional Info',
    method: 'PUT',
    endpoint: '/doctor-profile/professional-info',
    headers: {
      'Authorization': 'Bearer YOUR_JWT_TOKEN_HERE',
      'Content-Type': 'application/json'
    },
    body: {
      specialization: ['general_medicine', 'cardiology'],
      experience: 8,
      qualification: [
        {
          degree: 'MBBS',
          institution: 'All India Institute of Medical Sciences',
          year: 2015
        }
      ],
      workLocation: 'Apollo Hospital, Delhi',
      department: 'Cardiology Department',
      designation: 'Senior Consultant',
      consultationFee: 1500,
      professionalPhone: '+919876543210',
      professionalEmail: 'dr.john@hospital.com',
      biography: 'Experienced cardiologist with expertise in interventional cardiology',
      languagesSpoken: ['English', 'Hindi', 'Bengali']
    }
  },
  {
    name: 'Update Availability',
    method: 'PATCH',
    endpoint: '/doctor-profile/availability',
    headers: {
      'Authorization': 'Bearer YOUR_JWT_TOKEN_HERE',
      'Content-Type': 'application/json'
    },
    body: {
      availableSlots: [
        {
          day: 'monday',
          startTime: '09:00',
          endTime: '17:00'
        },
        {
          day: 'tuesday',
          startTime: '10:00',
          endTime: '18:00'
        }
      ]
    }
  },
  {
    name: 'Get Profile Completion Status',
    method: 'GET',
    endpoint: '/doctor-profile/USER_ID_HERE/completion-status',
    headers: {
      'Authorization': 'Bearer YOUR_JWT_TOKEN_HERE',
      'Content-Type': 'application/json'
    }
  }
];

// Admin-only test cases
const adminTestCases = [
  {
    name: 'Update Medical License (Admin Only)',
    method: 'PATCH',
    endpoint: '/doctor-profile/USER_ID_HERE/license',
    headers: {
      'Authorization': 'Bearer YOUR_ADMIN_JWT_TOKEN_HERE',
      'Content-Type': 'application/json'
    },
    body: {
      medicalLicenseNumber: 'MCI/12345/2015',
      issuingAuthority: 'Medical Council of India',
      expiryDate: '2025-12-31',
      stateOfPractice: 'Karnataka'
    }
  },
  {
    name: 'Validate License (Admin Only)',
    method: 'PATCH',
    endpoint: '/doctor-profile/validate-license',
    headers: {
      'Authorization': 'Bearer YOUR_ADMIN_JWT_TOKEN_HERE',
      'Content-Type': 'application/json'
    },
    body: {
      licenseNumber: 'MCI/12345/2015',
      issuingAuthority: 'Medical Council of India'
    }
  }
];

console.log('='.repeat(60));
console.log('DOCTOR PROFILE MANAGEMENT API TEST CASES');
console.log('='.repeat(60));

console.log('\n📋 DOCTOR ENDPOINTS (Healthcare Provider Access):');
testCases.forEach((testCase, index) => {
  console.log(`\n${index + 1}. ${testCase.name}`);
  console.log(`   ${testCase.method} ${BASE_URL}${testCase.endpoint}`);
  
  if (testCase.body) {
    console.log('   Request Body:');
    console.log('   ' + JSON.stringify(testCase.body, null, 2).replace(/\n/g, '\n   '));
  }
  
  console.log('   Example cURL:');
  let curlCommand = `curl -X ${testCase.method} "${BASE_URL}${testCase.endpoint}"`;
  Object.entries(testCase.headers).forEach(([key, value]) => {
    curlCommand += ` -H "${key}: ${value}"`;
  });
  if (testCase.body) {
    curlCommand += ` -d '${JSON.stringify(testCase.body)}'`;
  }
  console.log(`   ${curlCommand}`);
});

console.log('\n🔐 ADMIN ENDPOINTS (Admin Access Only):');
adminTestCases.forEach((testCase, index) => {
  console.log(`\n${index + 1}. ${testCase.name}`);
  console.log(`   ${testCase.method} ${BASE_URL}${testCase.endpoint}`);
  
  if (testCase.body) {
    console.log('   Request Body:');
    console.log('   ' + JSON.stringify(testCase.body, null, 2).replace(/\n/g, '\n   '));
  }
  
  console.log('   Example cURL:');
  let curlCommand = `curl -X ${testCase.method} "${BASE_URL}${testCase.endpoint}"`;
  Object.entries(testCase.headers).forEach(([key, value]) => {
    curlCommand += ` -H "${key}: ${value}"`;
  });
  if (testCase.body) {
    curlCommand += ` -d '${JSON.stringify(testCase.body)}'`;
  }
  console.log(`   ${curlCommand}`);
});

console.log('\n📝 SETUP INSTRUCTIONS:');
console.log('1. Replace YOUR_JWT_TOKEN_HERE with a valid healthcare provider JWT token');
console.log('2. Replace YOUR_ADMIN_JWT_TOKEN_HERE with a valid admin JWT token');
console.log('3. Replace USER_ID_HERE with the actual user ID of the doctor');
console.log('4. Ensure the backend server is running on localhost:3001');
console.log('5. Test each endpoint individually using the cURL commands above');

console.log('\n🔍 EXPECTED RESPONSES:');
console.log('- All endpoints return JSON responses');
console.log('- Success responses have 200 status code');
console.log('- Error responses include appropriate HTTP status codes and error messages');
console.log('- Validation errors return 400 with detailed field-level errors');
console.log('- Authorization errors return 403 for insufficient permissions');
console.log('- Missing resources return 404');

console.log('\n✅ VALIDATION FEATURES:');
console.log('- ObjectId validation for user IDs');
console.log('- Role-based access control (doctors vs admins)');
console.log('- Availability slot overlap detection');
console.log('- Professional information completeness checking');
console.log('- Medical license format validation');
console.log('- Comprehensive audit trail logging');

console.log('\n🏥 BUSINESS RULES:');
console.log('- Only healthcare providers can update their own professional info');
console.log('- Only admins can update/validate medical licenses');
console.log('- Profile completion must be ≥75% to accept consultations');
console.log('- Medical license verification is manual by employees');
console.log('- All changes are logged for audit purposes');
console.log('='.repeat(60));
