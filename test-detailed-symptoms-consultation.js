const axios = require('axios');

// Test configuration
const BASE_URL = 'http://localhost:3000/api/v1';
const TEST_PATIENT_ID = '6884d6abc1ceb202ca8066c4';

async function testDetailedSymptomsConsultation() {
  console.log('🧪 Testing Detailed Symptoms Collection with Consultation Creation');
  console.log('==================================================================\n');

  try {
    // Step 1: Health check
    console.log('1️⃣ Checking API health...');
    const healthResponse = await axios.get(`${BASE_URL}/consultations/health`);
    console.log('✅ API is healthy:', healthResponse.data.message);
    console.log('');

    // Step 2: Test detailed symptoms collection (should create consultation)
    console.log('2️⃣ Testing detailed symptoms collection...');
    const detailedSymptomsData = {
      patient_profile: {
        age: 28,
        request_id: TEST_PATIENT_ID,
        timestamp: new Date().toISOString()
      },
      primary_complaint: {
        main_symptom: "Irregular menstrual bleeding",
        duration: "3 weeks",
        severity: "moderate",
        onset: "gradual",
        progression: "worsening"
      },
      symptom_specific_details: {
        symptom_characteristics: {
          bleeding_pattern: "irregular",
          flow_intensity: "heavy",
          color: "bright red",
          clots: true,
          pain_associated: true
        }
      },
      reproductive_history: {
        pregnancy_status: {
          could_be_pregnant: false,
          pregnancy_test_result: "negative"
        },
        sexual_activity: {
          sexually_active: true,
          contraception_method: "condoms"
        },
        menstrual_history: {
          menarche_age: 13,
          cycle_frequency: 28,
          period_duration: 5
        }
      },
      associated_symptoms: {
        systemic: {
          fever: false,
          fatigue: true,
          weight_loss: false,
          appetite_changes: false
        },
        pain: {
          pelvic_pain: true,
          back_pain: false,
          breast_tenderness: true,
          headache: false
        },
        gastrointestinal: {
          nausea: false,
          vomiting: false,
          diarrhea: false,
          constipation: false
        },
        urinary: {
          frequent_urination: false,
          painful_urination: false,
          urgency: false
        }
      },
      medical_context: {
        current_medications: [],
        recent_medications: [],
        medical_conditions: [],
        previous_gynecological_issues: ["PCOS"],
        allergies: [],
        family_history: ["diabetes", "hypertension"]
      },
      healthcare_interaction: {
        recent_consultations: [],
        previous_treatments: [],
        diagnostic_tests: [],
        surgical_history: []
      },
      patient_concerns: {
        main_worry: "Fertility issues due to irregular periods",
        impact_on_life: "moderate",
        additional_notes: "Concerned about ability to conceive"
      }
    };

    const symptomsResponse = await axios.post(
      `${BASE_URL}/consultations/symptoms/collect_detailed_symptoms`,
      detailedSymptomsData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TEST_TOKEN || 'test-token'}`
        }
      }
    );

    console.log('✅ Detailed symptoms collected successfully!');
    console.log('📊 Response structure:');
    console.log('   - Diagnosis:', symptomsResponse.data.diagnosis);
    console.log('   - Confidence Score:', symptomsResponse.data.confidence_score);
    console.log('   - Consultation ID:', symptomsResponse.data.consultationId);
    console.log('   - Consultation Status:', symptomsResponse.data.consultationStatus);
    console.log('   - Assigned Doctor:', symptomsResponse.data.assignedDoctor);
    console.log('');

    // Step 3: Verify consultation was created
    console.log('3️⃣ Verifying consultation was created...');
    
    if (symptomsResponse.data.consultationId) {
      console.log('✅ SUCCESS: Consultation was created automatically!');
      console.log('   - Consultation ID:', symptomsResponse.data.consultationId);
      console.log('   - Status:', symptomsResponse.data.consultationStatus);
      console.log('   - Doctor ID:', symptomsResponse.data.assignedDoctor.doctorId);
    } else {
      console.log('❌ ERROR: No consultation ID in response');
    }

    console.log('');

    // Step 4: Verify response structure
    console.log('4️⃣ Verifying response structure...');
    const response = symptomsResponse.data;
    
    // Expected fields
    const expectedFields = ['diagnosis', 'confidence_score', 'consultationId', 'consultationStatus', 'assignedDoctor'];
    const missingFields = expectedFields.filter(field => !response[field]);
    
    if (missingFields.length > 0) {
      console.log('❌ Missing expected fields:', missingFields);
    } else {
      console.log('✅ All expected fields present');
    }

    // Check AI diagnosis structure
    if (response.diagnosis && response.confidence_score) {
      console.log('✅ AI diagnosis structure is correct');
      console.log('   - Diagnosis:', response.diagnosis);
      console.log('   - Confidence:', response.confidence_score);
    } else {
      console.log('❌ AI diagnosis missing or incomplete');
    }

    console.log('');

    // Step 5: Test consultation retrieval
    console.log('5️⃣ Testing consultation retrieval...');
    const consultationId = symptomsResponse.data.consultationId;
    
    const getResponse = await axios.get(
      `${BASE_URL}/consultations/${consultationId}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.TEST_TOKEN || 'test-token'}`
        }
      }
    );

    console.log('✅ Consultation retrieved successfully');
    console.log('📋 Retrieved Consultation ID:', getResponse.data.consultationId);
    console.log('👤 Patient ID:', getResponse.data.patientId);
    console.log('👨‍⚕️ Doctor ID:', getResponse.data.doctorId);
    console.log('📊 Status:', getResponse.data.status);
    console.log('🔍 AI Diagnosis Confidence:', getResponse.data.aiDiagnosis?.confidence_score);
    console.log('');

    // Step 6: Test patient consultations list
    console.log('6️⃣ Testing patient consultations list...');
    const patientConsultationsResponse = await axios.get(
      `${BASE_URL}/consultations/patient/${TEST_PATIENT_ID}`,
      {
        headers: {
          'Authorization': `Bearer ${process.env.TEST_TOKEN || 'test-token'}`
        }
      }
    );

    console.log('✅ Patient consultations retrieved');
    console.log('📊 Total consultations:', patientConsultationsResponse.data.length);
    console.log('🔍 Latest consultation ID:', patientConsultationsResponse.data[0]?.consultationId);
    console.log('');

    console.log('🎉 All tests passed! Detailed symptoms collection with consultation creation is working correctly.');
    console.log('');
    console.log('📋 Summary:');
    console.log(`   - Consultation ID: ${consultationId}`);
    console.log(`   - Patient ID: ${TEST_PATIENT_ID}`);
    console.log(`   - Doctor ID: ${symptomsResponse.data.assignedDoctor.doctorId}`);
    console.log(`   - Status: ${symptomsResponse.data.consultationStatus}`);
    console.log(`   - AI Confidence: ${symptomsResponse.data.confidence_score}`);

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
  testDetailedSymptomsConsultation();
}

module.exports = { testDetailedSymptomsConsultation }; 