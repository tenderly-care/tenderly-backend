export default async function globalTeardown() {
  console.log('🧹 Cleaning up test environment...');
  
  // Stop MongoDB Memory Server
  const mongoServer = (global as any).__MONGOSERVER__;
  if (mongoServer) {
    await (await mongoServer).stop();
    console.log('✅ MongoDB Memory Server stopped');
  }
  
  console.log('✅ Test environment cleanup complete');
}
