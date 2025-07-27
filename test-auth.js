const http = require('http');

async function tryLogin(email, password) {
  const loginData = JSON.stringify({ email, password });
  
  const options = {
    hostname: 'localhost',
    port: 3000,
    path: '/api/v1/auth/login',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(loginData)
    }
  };
  
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        try {
          const data = JSON.parse(body);
          if (res.statusCode === 200 || res.statusCode === 201) {
            console.log('✅ Authentication successful');
            console.log('Token:', data.access_token?.substring(0, 50) + '...');
            resolve(data.access_token);
          } else {
            console.log('❌ Authentication failed');
            console.log('Response:', data);
            resolve(null); // Don't reject, just return null to try next password
          }
        } catch (e) {
          console.log('❌ Failed to parse response:', body);
          resolve(null);
        }
      });
    });
    
    req.on('error', (error) => {
      console.log('❌ Request error:', error.message);
      resolve(null);
    });
    
    req.write(loginData);
    req.end();
  });
}

async function testAuth() {
  console.log('🔐 Testing authentication...');
  
  // Try different passwords that might be used
  const passwords = ['password123', 'testpassword', 'test123', 'password', '123456'];
  const email = 'shabnooransari@test.com';
  
  for (const password of passwords) {
    console.log(`\n🔐 Trying password: ${password}`);
    const token = await tryLogin(email, password);
    if (token) {
      console.log('\n🎉 Found working credentials!');
      console.log('Email:', email);
      console.log('Password:', password);
      console.log('Token:', token);
      return token;
    }
  }
  
  console.log('\n❌ No working password found');
  return null;
}

testAuth().catch(console.error);
