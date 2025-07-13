# Tenderly Backend Authentication Workflow Guide

This comprehensive guide covers the complete authentication system for the Tenderly OB-GYN telemedicine platform. Follow this step-by-step guide to understand and test every aspect of the authentication flow.

## Table of Contents

1. [System Overview](#system-overview)
2. [Prerequisites](#prerequisites)
3. [Authentication Flow Architecture](#authentication-flow-architecture)
4. [API Endpoints Reference](#api-endpoints-reference)
5. [Step-by-Step Testing Guide](#step-by-step-testing-guide)
6. [Postman Collection Setup](#postman-collection-setup)
7. [Security Features](#security-features)
8. [Troubleshooting](#troubleshooting)

## System Overview

The Tenderly authentication system provides:
- **Secure user registration and login**
- **Multi-Factor Authentication (MFA)**
- **JWT-based session management**
- **Role-based access control**
- **Password reset functionality**
- **Session management across devices**
- **Audit logging**
- **Device verification**

## Prerequisites

Before testing, ensure you have:
- Node.js and npm installed
- MongoDB running (default: localhost:27017)
- Redis running (default: localhost:6379)
- Postman installed
- Backend server running on `http://localhost:3000`

### Starting the Backend Server

```bash
# Clone and setup
git clone <repository-url>
cd tenderly-backend
npm install

# Configure environment
cp .env.example .env
# Edit .env with your database connections

# Start the server
npm run start:dev
```

## Authentication Flow Architecture

### 1. User Registration Flow
```
1. User submits registration data
2. System validates input
3. Password is hashed using bcrypt
4. User record created in MongoDB
5. Email verification token generated
6. Welcome email sent (if email service configured)
7. User account created with 'pending' status
```

### 2. Login Flow
```
1. User submits email/password
2. System validates credentials
3. Check if MFA is required
4. If MFA required: generate and send MFA code
5. User submits MFA code
6. System validates MFA code
7. Generate JWT access and refresh tokens
8. Create session in Redis
9. Return tokens and user info
```

### 3. Session Management
```
1. Each login creates a unique session
2. Session stored in Redis with TTL
3. Access tokens contain session ID
4. Token validation checks session validity
5. Logout invalidates session and tokens
```

## API Endpoints Reference

### Base URL: `http://localhost:3000/api/v1`

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/auth/register` | User registration | No |
| POST | `/auth/login` | User login | No |
| POST | `/auth/logout` | User logout | Yes |
| POST | `/auth/refresh` | Refresh access token | No |
| GET | `/auth/me` | Get current user profile | Yes |
| POST | `/auth/verify-email` | Verify email address | No |
| POST | `/auth/forgot-password` | Request password reset | No |
| POST | `/auth/reset-password` | Reset password with token | No |
| PATCH | `/auth/change-password` | Change password | Yes |
| POST | `/auth/mfa/setup` | Setup MFA | Yes |
| POST | `/auth/mfa/verify-setup` | Verify MFA setup | Yes |
| POST | `/auth/mfa/generate-login-code` | Generate login MFA code | No |
| DELETE | `/auth/mfa` | Disable MFA | Yes |
| GET | `/auth/sessions` | Get active sessions | Yes |
| DELETE | `/auth/sessions/:sessionId` | Terminate specific session | Yes |
| GET | `/auth/audit/me` | Get audit logs | Yes |
| POST | `/auth/verify-device` | Verify and trust device | Yes |

## Step-by-Step Testing Guide

### Step 1: User Registration

**Endpoint:** `POST /auth/register`

**Request Body:**
```json
{
  "email": "dr.john.doe@example.com",
  "password": "SecurePass123!",
  "firstName": "Dr. John",
  "lastName": "Doe",
  "phone": "+911234567890",
  "roles": ["healthcare_provider"],
  "professionalInfo": {
    "medicalLicenseNumber": "MED123456",
    "specialization": ["gynecology", "obstetrics"]
  }
}
```

**Expected Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900,
  "user": {
    "id": "userId",
    "email": "dr.john.doe@example.com",
    "firstName": "Dr. John",
    "lastName": "Doe",
    "roles": ["healthcare_provider"],
    "accountStatus": "active",
    "isEmailVerified": false,
    "isMFAEnabled": true,
    "requiresMFA": true
  }
}
```

### Step 2: Email Verification (Optional)

**Endpoint:** `POST /auth/verify-email`

**Request Body:**
```json
{
  "email": "dr.john.doe@example.com",
  "verificationToken": "token-from-email"
}
```

### Step 3: User Login

**Endpoint:** `POST /auth/login`

**Request Body:**
```json
{
  "email": "dr.john.doe@example.com",
  "password": "SecurePass123!"
}
```

**Expected Response:**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 900,
  "user": {
    "id": "userId",
    "email": "dr.john.doe@example.com",
    "firstName": "Dr. John",
    "lastName": "Doe",
    "roles": ["healthcare_provider"],
    "accountStatus": "active",
    "isEmailVerified": true,
    "isMFAEnabled": true,
    "requiresMFA": true
  }
}
```

### Step 4: Access Protected Resources

**Endpoint:** `GET /auth/me`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Expected Response:**
```json
{
  "_id": "userId",
  "firstName": "Dr. John",
  "lastName": "Doe",
  "email": "dr.john.doe@example.com",
  "phone": "+911234567890",
  "roles": ["healthcare_provider"],
  "accountStatus": "active",
  "isEmailVerified": true,
  "isMFAEnabled": true,
  "professionalInfo": {
    "medicalLicenseNumber": "MED123456",
    "specialization": ["gynecology", "obstetrics"]
  },
  "trustedDevices": [],
  "loginHistory": [...]
}
```

### Step 5: Session Management

**Get Active Sessions:**
```
GET /auth/sessions
Authorization: Bearer <access_token>
```

**Terminate Specific Session:**
```
DELETE /auth/sessions/sessionId
Authorization: Bearer <access_token>
```

### Step 6: Token Refresh

**Endpoint:** `POST /auth/refresh`

**Request Body:**
```json
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Step 7: Password Management

**Change Password:**
```
PATCH /auth/change-password
Authorization: Bearer <access_token>

{
  "currentPassword": "SecurePass123!",
  "newPassword": "NewSecurePass456!"
}
```

**Forgot Password:**
```
POST /auth/forgot-password

{
  "email": "dr.john.doe@example.com"
}
```

**Reset Password:**
```
POST /auth/reset-password

{
  "email": "dr.john.doe@example.com",
  "resetToken": "token-from-email",
  "newPassword": "NewSecurePass456!"
}
```

### Step 8: MFA Setup

**Initialize MFA Setup:**
```
POST /auth/mfa/setup
Authorization: Bearer <access_token>

{
  "method": "authenticator"
}
```

**Verify MFA Setup:**
```
POST /auth/mfa/verify-setup
Authorization: Bearer <access_token>

{
  "method": "authenticator",
  "code": "123456"
}
```

### Step 9: Device Verification

**Verify Device:**
```
POST /auth/verify-device
Authorization: Bearer <access_token>

{
  "deviceFingerprint": "unique-device-id-123",
  "deviceName": "My Laptop"
}
```

### Step 10: Audit Logs

**Get User Audit Logs:**
```
GET /auth/audit/me?limit=20&offset=0
Authorization: Bearer <access_token>
```

### Step 11: Logout

**Endpoint:** `POST /auth/logout`

**Headers:**
```
Authorization: Bearer <access_token>
```

**Request Body (Optional):**
```json
{
  "allDevices": true
}
```

## Postman Collection Setup

### 1. Import Collection

Save the following as a JSON file and import into Postman:

```json
{
  "info": {
    "name": "Tenderly Authentication API",
    "description": "Complete authentication workflow for Tenderly backend"
  },
  "variable": [
    {
      "key": "baseUrl",
      "value": "http://localhost:3000/api/v1"
    },
    {
      "key": "accessToken",
      "value": ""
    },
    {
      "key": "refreshToken",
      "value": ""
    }
  ],
  "auth": {
    "type": "bearer",
    "bearer": [
      {
        "key": "token",
        "value": "{{accessToken}}"
      }
    ]
  }
}
```

### 2. Environment Variables

Create a Postman environment with:
- `baseUrl`: `http://localhost:3000/api/v1`
- `accessToken`: (automatically set from responses)
- `refreshToken`: (automatically set from responses)
- `userEmail`: `dr.john.doe@example.com`
- `userPassword`: `SecurePass123!`

### 3. Pre-request Scripts

Add this to login/register requests to automatically save tokens:

```javascript
// Pre-request script for login/register
pm.test("Save tokens", function () {
    const responseJson = pm.response.json();
    if (responseJson.accessToken) {
        pm.environment.set("accessToken", responseJson.accessToken);
    }
    if (responseJson.refreshToken) {
        pm.environment.set("refreshToken", responseJson.refreshToken);
    }
});
```

### 4. Test Scripts

Add this to requests to validate responses:

```javascript
// Test script for authentication endpoints
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Response has required fields", function () {
    const responseJson = pm.response.json();
    pm.expect(responseJson).to.have.property("accessToken");
    pm.expect(responseJson).to.have.property("user");
});
```

## Security Features

### 1. JWT Token Security
- **Short-lived access tokens** (15 minutes)
- **Longer refresh tokens** (7 days)
- **Token blacklisting** on logout
- **Session-based validation**

### 2. Password Security
- **bcrypt hashing** with salt rounds
- **Password strength validation**
- **Secure password reset flow**

### 3. MFA Implementation
- **TOTP-based authenticator apps**
- **SMS and email backup codes**
- **Backup codes for recovery**

### 4. Session Management
- **Redis-based session storage**
- **Session TTL and cleanup**
- **Multi-device session tracking**
- **Concurrent session limits**

### 5. Audit Logging
- **All authentication events logged**
- **IP address and device tracking**
- **Failed login attempt monitoring**
- **Security event notifications**

## Troubleshooting

### Common Issues

1. **401 Unauthorized**
   - Check if token is valid and not expired
   - Verify session exists in Redis
   - Ensure proper Authorization header format

2. **Session Expired**
   - Use refresh token to get new access token
   - Re-login if refresh token is expired

3. **MFA Code Invalid**
   - Ensure time synchronization
   - Check if code has been used before
   - Verify MFA method is properly set up

4. **Database Connection Issues**
   - Verify MongoDB is running
   - Check Redis connection
   - Validate environment variables

### Testing Checklist

- [ ] User registration works
- [ ] Email verification functions
- [ ] Login with correct credentials
- [ ] MFA setup and verification
- [ ] Access protected endpoints
- [ ] Token refresh mechanism
- [ ] Password change functionality
- [ ] Password reset flow
- [ ] Session management
- [ ] Device verification
- [ ] Audit log retrieval
- [ ] Proper logout and token invalidation

### Debug Mode

Enable debug logging by setting:
```bash
DEBUG=auth:* npm run start:dev
```

This will show detailed authentication flow logs.

## Conclusion

This authentication system provides enterprise-grade security suitable for healthcare applications. The multi-layered approach ensures:

- **Compliance** with healthcare data regulations
- **Security** through multiple authentication factors
- **Usability** with smooth user experience
- **Scalability** for growing user base
- **Auditability** for security monitoring

For additional support or questions, refer to the API documentation or contact the development team.
