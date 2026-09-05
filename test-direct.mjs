import https from 'https';

function fetchWithCookie(url, cookie) {
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
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function test() {
  // First login to get cookie
  const loginUrl = '/api/dev/login?email=e2e-client@test.local';
  const loginOptions = {
    hostname: 'sos-amende.vercel.app',
    path: loginUrl,
    method: 'GET',
    headers: { 'User-Agent': 'Mozilla/5.0' },
    rejectUnauthorized: false
  };
  
  const loginResp = await new Promise((resolve, reject) => {
    const req = https.request(loginOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.end();
  });
  
  console.log('Login status:', loginResp.status);
  console.log('Login cookies:', loginResp.headers['set-cookie']);
  
  const cookie = loginResp.headers['set-cookie']?.[0]?.split(';')[0] || 'dev_login=e2e-client@test.local';
  
  // Test detail page
  const detailResp = await fetchWithCookie('/dashboard/cases/pv-sign-002?dev=1', cookie);
  console.log('\nDetail page status:', detailResp.status);
  console.log('Detail page length:', detailResp.body.length);
  console.log('Has 404:', detailResp.body.includes('404') || detailResp.body.includes('This page could not be found'));
  console.log('Has 500:', detailResp.body.includes('500') || detailResp.body.includes('Application error'));
  console.log('Has Erreur:', detailResp.body.includes('Erreur'));
  console.log('Has lettre:', detailResp.body.includes('Erreur plaque') || detailResp.body.includes('lettreGeneree'));
  console.log('Has SignaturePad:', detailResp.body.includes('Signature électronique'));
  
  // Test juriste detail
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
  console.log('\nJuriste login status:', juristeLogin.status);
  
  const juristeDetail = await fetchWithCookie('/dashboard/juriste/pv-pret-003?dev=1', juristeCookie);
  console.log('\nJuriste detail status:', juristeDetail.status);
  console.log('Juriste detail length:', juristeDetail.body.length);
  console.log('Has 404/500:', juristeDetail.body.includes('404') || juristeDetail.body.includes('500') || juristeDetail.body.includes('Application error'));
  console.log('Has LettreEdition:', juristeDetail.body.includes('LettreEdition') || juristeDetail.body.includes('Corrigez'));
}

test().catch(console.error);