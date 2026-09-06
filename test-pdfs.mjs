import https from 'https';

function fetchUrl(url, cookie) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'sos-amende.vercel.app',
      path: url,
      method: 'GET',
      headers: {
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0'
      },
      rejectUnauthorized: false
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, contentType: res.headers['content-type'], body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function test() {
  // Login
  const loginResp = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'sos-amende.vercel.app',
      path: '/api/dev/login?email=e2e-client@test.local',
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      rejectUnauthorized: false
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
  
  const cookie = loginResp.headers['set-cookie']?.[0]?.split(';')[0] || 'dev_login=e2e-client@test.local';
  console.log('Login:', loginResp.status);
  
  // Test PDF download
  const pdfResp = await fetchUrl('/uploads/demo-lettre.pdf', cookie);
  console.log('\nPDF download:', pdfResp.status, pdfResp.contentType);
  
  // Test signature PNG
  const sigResp = await fetchUrl('/uploads/demo-signature.png', cookie);
  console.log('Signature PNG:', sigResp.status, sigResp.contentType);
  
  // Test PV image
  const pvResp = await fetchUrl('/uploads/demo-pv.jpg', cookie);
  console.log('PV image:', pvResp.status, pvResp.contentType);
  
  // Test PRET page (has PDF link)
  const pretResp = await fetchUrl('/dashboard/cases/pv-pret-003?dev=1', cookie);
  console.log('\nPRET page:', pretResp.status);
  console.log('Has PDF link:', pretResp.body.includes('Télécharger la lettre signée'));
  
  // Test ENVOYE page
  const envoyeResp = await fetchUrl('/dashboard/cases/pv-envoye-004?dev=1', cookie);
  console.log('\nENVOYE page:', envoyeResp.status);
  console.log('Has PDF link:', envoyeResp.body.includes('Télécharger la lettre envoyée'));
  console.log('Has lettre visible:', envoyeResp.body.includes('Votre lettre de contestation'));
  
  // Test juriste ENVOYE page
  const juristeLogin = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'sos-amende.vercel.app',
      path: '/api/dev/login?email=e2e-juriste@test.local',
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      rejectUnauthorized: false
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers }));
    });
    req.on('error', reject);
    req.end();
  });
  const juristeCookie = juristeLogin.headers['set-cookie']?.[0]?.split(';')[0] || 'dev_login=e2e-juriste@test.local';
  
  const juristeDetail = await fetchUrl('/dashboard/juriste/pv-pret-003?dev=1', juristeCookie);
  console.log('\nJuriste PRET page:', juristeDetail.status);
  console.log('Has PDF link:', juristeDetail.body.includes('Télécharger la lettre signée'));
  
  const juristeEnvo = await fetchUrl('/dashboard/juriste/pv-envoye-004?dev=1', juristeCookie);
  console.log('Juriste ENVOYE page:', juristeEnvo.status);
  console.log('Has DecisionOmpForm:', juristeEnvo.body.includes('Décision de l\'OMP') || juristeEnvo.body.includes('Enregistrer la décision'));
}

test().catch(console.error);