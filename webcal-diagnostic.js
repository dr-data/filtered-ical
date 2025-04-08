const http = require('http');
const https = require('https');

// Convert webcal URL to HTTP for testing
const webcalUrl = 'webcal://localhost:5174/calendar/L2FwaS96ZXRsYW5kaGFsbA/cm90YXJpYW4/filtered.ics';
const httpUrl = webcalUrl.replace('webcal://', 'http://');

console.log(`Testing connection to: ${httpUrl}`);

// Check if server is running on the specified port
function checkServerStatus() {
  return new Promise((resolve, reject) => {
    const req = http.request(
      new URL(httpUrl),
      { method: 'GET', timeout: 5000 },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data.substring(0, 100) + (data.length > 100 ? '...' : '')
          });
        });
      }
    );

    req.on('error', (error) => {
      reject(error);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.end();
  });
}

// Main diagnostic function
async function diagnoseWebcalIssue() {
  try {
    console.log('Checking if server is running...');
    const response = await checkServerStatus();
    
    console.log(`Server responded with status: ${response.status}`);
    console.log('Response headers:', response.headers);
    
    if (response.status >= 200 && response.status < 300) {
      console.log('Server is responding correctly. Sample data:', response.data);
      console.log('\nPossible issues:');
      console.log('1. Your calendar application might not support the webcal protocol');
      console.log('2. The data format might not be valid iCalendar format');
    } else {
      console.log('\nServer responded but returned an error status code.');
      console.log('\nPossible issues:');
      console.log(`1. The endpoint returned status ${response.status}`);
      console.log('2. Authentication might be required');
      console.log('3. The path or parameters might be incorrect');
    }
  } catch (error) {
    console.error('Error connecting to server:', error.message);
    console.log('\nPossible issues:');
    console.log('1. The server at localhost:5174 is not running');
    console.log('2. There is a firewall blocking the connection');
    console.log('3. The server application has crashed or is not properly configured');
    console.log('\nSolutions to try:');
    console.log('1. Make sure your local server is running on port 5174');
    console.log('2. Check server logs for errors');
    console.log('3. Try accessing http://localhost:5174 in your browser to verify server status');
  }
}

diagnoseWebcalIssue();
