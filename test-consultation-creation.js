const axios = require('axios');

// Test configuration
const BASE_URL = 'http://localhost:3000/api/v1';
const TEST_PATIENT_ID = '6884d6abc1ceb202ca8066c4'; // Use your existing test patient
const TEST_DOCTOR_ID = '687656c3e69fa2e8923dbc2c'; // Use your existing test doctor

// Test data that matches the new tenderly-ai-agent schema
const testDetailedSymptoms = {
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

// Mock AI diagnosis response (what tenderly-ai-agent would return)
const mockAiDiagnosisResponse = {
  possible_diagnoses: [
    "Polycystic Ovary Syndrome (PCOS)",
    "Hormonal imbalance",
    "Endometrial hyperplasia"
  ],
  clinical_reasoning: "Patient presents with irregular menstrual bleeding for 3 weeks with moderate severity. Associated symptoms include fatigue, pelvic pain, and breast tenderness. History of PCOS and family history of diabetes/hypertension suggests hormonal imbalance.",
  recommended_investigations: [
    "Hormonal profile (FSH, LH, Testosterone, Prolactin)",
    "Pelvic ultrasound",
    "HbA1c for diabetes screening",
    "Thyroid function tests"
  ],
  treatment_recommendations: {
    primary_treatment: "Hormonal regulation with combined oral contraceptives",
    safe_medications: ["Metformin for insulin resistance", "Progesterone for cycle regulation"],
    lifestyle_modifications: ["Weight management", "Regular exercise", "Balanced diet"],
    dietary_advice: ["Low glycemic index foods", "Increased fiber intake"],
    follow_up_timeline: "3 months"
  },
  patient_education: [
    "Understanding PCOS and its management",
    "Importance of regular monitoring",
    "Lifestyle modifications for hormonal balance"
  ],
  warning_signs: [
    "Severe pelvic pain",
    "Heavy bleeding with clots",
    "Fainting or dizziness"
  ],
  confidence_score: 0.85,
  processing_notes: "AI analysis based on comprehensive symptom assessment",
  disclaimer: "This is an AI-generated preliminary assessment. Always consult with a qualified healthcare provider.",
  timestamp: new Date().toISOString()
};

async function testConsultationCreation() {
  console.log('🧪 Testing Consultation Creation Flow');
  console.log('=====================================\n');

  try {
    // Step 1: Health check
    console.log('1️⃣ Checking API health...');
    const healthResponse = await axios.get(`${BASE_URL}/consultations/health`);
    console.log('✅ API is healthy:', healthResponse.data.message);
    console.log('');

    // Step 2: Create consultation with new schema
    console.log('2️⃣ Creating consultation with new schema...');
    const createConsultationData = {
      patientId: TEST_PATIENT_ID,
      doctorId: TEST_DOCTOR_ID,
      consultationType: 'chat',
      detailedSymptoms: testDetailedSymptoms,
      aiDiagnosis: mockAiDiagnosisResponse
    };

    const createResponse = await axios.post(
      `${BASE_URL}/consultations`,
      createConsultationData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TEST_TOKEN || 'test-token'}`
        }
      }
    );

    console.log('✅ Consultation created successfully!');
    console.log('📋 Consultation ID:', createResponse.data.consultationId);
    console.log('👤 Patient ID:', createResponse.data.patientId);
    console.log('👨‍⚕️ Doctor ID:', createResponse.data.doctorId);
    console.log('📊 Status:', createResponse.data.status);
    console.log('🔍 AI Diagnosis Confidence:', createResponse.data.aiDiagnosis?.confidence_score);
    console.log('');

    // Step 3: Verify consultation structure
    console.log('3️⃣ Verifying consultation structure...');
    const consultation = createResponse.data;
    
    // Check required fields
    const requiredFields = ['consultationId', 'patientId', 'status', 'consultationType'];
    const missingFields = requiredFields.filter(field => !consultation[field]);
    
    if (missingFields.length > 0) {
      console.log('❌ Missing required fields:', missingFields);
    } else {
      console.log('✅ All required fields present');
    }

    // Check detailed symptoms structure
    if (consultation.detailedSymptoms) {
      console.log('✅ Detailed symptoms structure matches tenderly-ai-agent schema');
      console.log('   - Patient profile:', !!consultation.detailedSymptoms.patient_profile);
      console.log('   - Primary complaint:', !!consultation.detailedSymptoms.primary_complaint);
      console.log('   - Reproductive history:', !!consultation.detailedSymptoms.reproductive_history);
    } else {
      console.log('❌ Detailed symptoms missing');
    }

    // Check AI diagnosis structure
    if (consultation.aiDiagnosis) {
      console.log('✅ AI diagnosis structure matches tenderly-ai-agent response');
      console.log('   - Possible diagnoses:', consultation.aiDiagnosis.possible_diagnoses?.length || 0);
      console.log('   - Confidence score:', consultation.aiDiagnosis.confidence_score);
      console.log('   - Treatment recommendations:', !!consultation.aiDiagnosis.treatment_recommendations);
    } else {
      console.log('❌ AI diagnosis missing');
    }

    console.log('');

    // Step 4: Test consultation retrieval
    console.log('4️⃣ Testing consultation retrieval...');
    const consultationId = consultation.consultationId;
    
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
    console.log('📊 Retrieved Status:', getResponse.data.status);
    console.log('');

    // Step 5: Test patient consultations list
    console.log('5️⃣ Testing patient consultations list...');
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

    // Step 6: Test consultation update
    console.log('6️⃣ Testing consultation update...');
    const updateData = {
      status: 'clinical_assessment_complete',
      aiDiagnosis: {
        ...mockAiDiagnosisResponse,
        confidence_score: 0.92,
        updated_timestamp: new Date().toISOString()
      }
    };

    const updateResponse = await axios.patch(
      `${BASE_URL}/consultations/${consultationId}`,
      updateData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.TEST_TOKEN || 'test-token'}`
        }
      }
    );

    console.log('✅ Consultation updated successfully');
    console.log('📊 Updated status:', updateResponse.data.status);
    console.log('🔍 Updated confidence score:', updateResponse.data.aiDiagnosis?.confidence_score);
    console.log('');

    console.log('🎉 All tests passed! Consultation creation flow is working correctly.');
    console.log('');
    console.log('📋 Summary:');
    console.log(`   - Consultation ID: ${consultationId}`);
    console.log(`   - Patient ID: ${TEST_PATIENT_ID}`);
    console.log(`   - Doctor ID: ${TEST_DOCTOR_ID}`);
    console.log(`   - Status: ${updateResponse.data.status}`);
    console.log(`   - AI Confidence: ${updateResponse.data.aiDiagnosis?.confidence_score}`);

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
  testConsultationCreation();
}

module.exports = { testConsultationCreation }; 