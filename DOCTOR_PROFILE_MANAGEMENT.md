# Doctor Profile Management System

A comprehensive, production-ready system for managing doctor professional information with self-service capabilities and manual medical license verification by employees.

## 🏗️ Architecture Overview

### **Self-Service with Admin Verification Model**
- **Doctors**: Can update their own professional information, availability, and profile details
- **Admins**: Handle medical license verification manually (as requested)
- **System**: Provides automated validation, audit trails, and completion tracking

## 📋 Features

### ✅ **Core Functionality**
- **Self-Service Profile Management**: Doctors can update their professional information
- **Manual License Verification**: Admin employees verify medical licenses manually
- **Availability Management**: Real-time slot management with overlap detection
- **Profile Completion Tracking**: Percentage-based completion with actionable insights
- **Comprehensive Audit Trail**: All changes logged for compliance and security

### 🔐 **Security & Compliance**
- **Role-Based Access Control**: Different permissions for doctors vs admins
- **ObjectId Validation**: Secure database query protection
- **Audit Logging**: Complete change history for regulatory compliance
- **Input Validation**: Comprehensive data validation with detailed error messages

### 📊 **Business Logic**
- **Profile Completion Requirements**: 75% completion needed to accept consultations
- **Availability Slot Validation**: Prevents overlapping time slots
- **Medical Specialization Management**: Predefined specializations with enum validation
- **Multi-language Support**: Tracks languages spoken by doctors

## 🚀 API Endpoints

### **Doctor Endpoints** (Healthcare Provider Access)

#### 1. Get Doctor Profile
```http
GET /api/v1/doctor-profile/:id
Authorization: Bearer <jwt_token>
```
**Response**: Complete doctor profile with completion percentage and verification status.

#### 2. Update Professional Information
```http
PUT /api/v1/doctor-profile/professional-info
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "specialization": ["general_medicine", "cardiology"],
  "experience": 8,
  "qualification": [
    {
      "degree": "MBBS",
      "institution": "All India Institute of Medical Sciences",
      "year": 2015
    }
  ],
  "workLocation": "Apollo Hospital, Delhi",
  "department": "Cardiology Department",
  "designation": "Senior Consultant",
  "consultationFee": 1500,
  "professionalPhone": "+919876543210",
  "professionalEmail": "dr.john@hospital.com",
  "biography": "Experienced cardiologist with expertise in interventional cardiology",
  "languagesSpoken": ["English", "Hindi", "Bengali"]
}
```

#### 3. Update Availability
```http
PATCH /api/v1/doctor-profile/availability
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "availableSlots": [
    {
      "day": "monday",
      "startTime": "09:00",
      "endTime": "17:00"
    },
    {
      "day": "tuesday",
      "startTime": "10:00",
      "endTime": "18:00"
    }
  ]
}
```

#### 4. Get Profile Completion Status
```http
GET /api/v1/doctor-profile/:id/completion-status
Authorization: Bearer <jwt_token>
```

### **Admin Endpoints** (Admin Access Only)

#### 1. Update Medical License
```http
PATCH /api/v1/doctor-profile/:id/license
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json

{
  "medicalLicenseNumber": "MCI/12345/2015",
  "issuingAuthority": "Medical Council of India",
  "expiryDate": "2025-12-31",
  "stateOfPractice": "Karnataka"
}
```

#### 2. Validate License
```http
PATCH /api/v1/doctor-profile/validate-license
Authorization: Bearer <admin_jwt_token>
Content-Type: application/json

{
  "licenseNumber": "MCI/12345/2015",
  "issuingAuthority": "Medical Council of India"
}
```

## 📋 Data Models

### **Specializations Supported**
```typescript
enum Specialization {
  GENERAL_MEDICINE = 'general_medicine',
  CARDIOLOGY = 'cardiology',
  DERMATOLOGY = 'dermatology',
  ENDOCRINOLOGY = 'endocrinology',
  GASTROENTEROLOGY = 'gastroenterology',
  GYNECOLOGY = 'gynecology',
  NEUROLOGY = 'neurology',
  ORTHOPEDICS = 'orthopedics',
  PEDIATRICS = 'pediatrics',
  PSYCHIATRY = 'psychiatry',
  PULMONOLOGY = 'pulmonology',
  RADIOLOGY = 'radiology',
  UROLOGY = 'urology',
  ONCOLOGY = 'oncology',
  OPHTHALMOLOGY = 'ophthalmology',
  ENT = 'ent',
  ANESTHESIOLOGY = 'anesthesiology',
  EMERGENCY_MEDICINE = 'emergency_medicine'
}
```

### **License Verification Status**
```typescript
enum LicenseVerificationStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
  EXPIRED = 'expired'
}
```

### **Days of Week**
```typescript
enum DayOfWeek {
  MONDAY = 'monday',
  TUESDAY = 'tuesday',
  WEDNESDAY = 'wednesday',
  THURSDAY = 'thursday',
  FRIDAY = 'friday',
  SATURDAY = 'saturday',
  SUNDAY = 'sunday'
}
```

## 🔧 Validation Rules

### **Professional Information**
- **Specialization**: Must be from predefined enum values
- **Experience**: 0-50 years range
- **Consultation Fee**: ₹100-₹10,000 range
- **Phone Numbers**: Must be valid Indian phone numbers (+91 format)
- **Email**: Professional email addresses validated

### **Availability Slots**
- **Time Format**: 24-hour format (HH:MM)
- **Overlap Detection**: Prevents conflicting time slots on same day
- **Day Validation**: Must be valid weekday enum values

### **Medical License**
- **Format Validation**: Proper license number format
- **Expiry Date**: YYYY-MM-DD format
- **State Validation**: Valid Indian state names

## 🛡️ Security Features

### **Authentication & Authorization**
- **JWT-based Authentication**: Secure token-based access
- **Role-based Permissions**: Different access levels for doctors vs admins
- **Request Validation**: Comprehensive input sanitization

### **Audit Trail**
- **Data Access Logging**: All read/write operations logged
- **Admin Action Tracking**: Special logging for admin activities
- **Change History**: Old vs new values tracked for all updates

### **Data Protection**
- **ObjectId Validation**: Prevents injection attacks
- **Sensitive Data Handling**: Proper sanitization in audit logs
- **Error Handling**: Secure error messages without data leakage

## 📊 Business Rules

### **Profile Completion Requirements**
1. **Required Fields**: firstName, lastName, email, phone
2. **Optional Fields**: specialization, experience, qualifications
3. **Consultation Eligibility**: ≥75% profile completion required
4. **License Verification**: Manual verification by admin employees

### **Availability Management** 
1. **No Overlapping Slots**: System prevents time conflicts
2. **Valid Time Ranges**: Start time must be before end time
3. **Weekday Scheduling**: Supports all 7 days of the week

### **Medical License Management**
1. **Manual Verification**: Admin employees verify licenses manually
2. **Pending by Default**: New licenses start as 'pending'
3. **State-based Practice**: Licenses linked to specific states

## 🚀 Getting Started

### **Prerequisites**
- Node.js 16+
- MongoDB
- Valid JWT tokens for authentication

### **Installation**
```bash
# Install dependencies
npm install

# Build the project
npm run build

# Start the server
npm run start
```

### **Environment Setup**
```env
DATABASE_URL=mongodb://localhost:27017/tenderly
JWT_SECRET=your-jwt-secret
PORT=3001
```

## 🧪 Testing

### **Running Tests**
```bash
# Run the test helper script
node test-doctor-profile.js
```

### **Manual Testing**
1. **Get a JWT Token**: Authenticate as a healthcare provider or admin
2. **Replace Placeholders**: Update USER_ID_HERE and JWT tokens in test commands
3. **Test Each Endpoint**: Use the provided cURL commands

### **Test Data Examples**
The system includes comprehensive test examples for:
- Professional information updates
- Availability scheduling
- Medical license verification
- Profile completion tracking

## 📝 Implementation Details

### **File Structure**
```
src/modules/users/
├── dto/
│   └── doctor-profile.dto.ts       # Data Transfer Objects
├── controllers/
│   └── doctor-profile.controller.ts # HTTP endpoints
├── services/
│   └──             # Business logic
├── schemas/
│   └── user.schema.ts              # Database schema
└── users.module.ts                 # Module configuration
```

### **Key Components**
1. **DTOs**: Type-safe data validation and API documentation
2. **Controller**: HTTP request handling with Swagger documentation
3. **Service**: Business logic with validation and audit trails
4. **Schema**: MongoDB data models with encryption support

### **Integration Points**
- **Audit Service**: Comprehensive logging for compliance
- **Authentication**: JWT-based security with role checking
- **Database**: MongoDB with Mongoose ODM
- **Validation**: Class-validator for input sanitization

## 🔍 Monitoring & Maintenance

### **Audit Logs**
- All profile changes logged with timestamps
- Admin actions specially tracked
- Old vs new values recorded for compliance

### **Error Handling**
- **400**: Validation errors with detailed field information
- **403**: Authorization errors for insufficient permissions
- **404**: Resource not found errors
- **500**: Server errors with secure messaging

### **Performance Considerations**
- **ObjectId Validation**: Prevents invalid database queries
- **Efficient Queries**: Optimized MongoDB operations
- **Caching**: Ready for Redis integration if needed

## 🤝 Contributing

### **Development Guidelines**
1. **Type Safety**: All code must be TypeScript compliant
2. **Validation**: Comprehensive input validation required
3. **Testing**: Unit tests for all business logic
4. **Documentation**: API endpoints must have Swagger docs
5. **Security**: All changes must maintain security standards

### **Code Style**
- ESLint configuration for consistent formatting
- Prettier for code formatting
- TypeScript strict mode enabled

## 📋 Future Enhancements

### **Phase 2 Features**
- **Real-time License Verification**: Integration with medical council APIs
- **Advanced Analytics**: Profile completion trends and insights
- **Multi-facility Support**: Doctors working at multiple locations
- **Bulk Operations**: Admin tools for managing multiple profiles

### **Technical Improvements**
- **Caching Layer**: Redis for improved performance
- **File Upload**: Profile pictures and document management
- **Notifications**: Email/SMS for status changes
- **API Rate Limiting**: Enhanced security measures

---

## 📞 Support

For technical support or questions about the doctor profile management system:

- **Documentation**: Comprehensive API docs available at `/api/docs`
- **Test Scripts**: Use the provided test script for validation
- **Error Logging**: Check audit logs for debugging information

**Built with ❤️ for Tenderly Healthcare Platform**
