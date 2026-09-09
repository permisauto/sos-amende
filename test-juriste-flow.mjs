import https from 'https';

function fetchWithCookie(url, cookie, method = 'GET', data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'sos-amende.vercel.app',
      path: url,
      method: method,
      headers: {
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0',
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      rejectUnauthorized: false
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function test() {
  // Login as juriste
  const loginResp = await new Promise((resolve, reject) => {
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
  
  const cookie = loginResp.headers['set-cookie']?.[0]?.split(';')[0] || 'dev_login=e2e-juriste@test.local';
  console.log('Login:', loginResp.status);
  
  // Test juriste detail page
  const detailResp = await fetchWithCookie('/dashboard/juriste/pv-pret-003?dev=1', cookie);
  console.log('\nJuriste PRET detail:', detailResp.status);
  
  // Check if the page has the buttons
  const hasValider = detailResp.body.includes('Approuver la lettre et envoyer la contestation');
  const hasRetourner = detailResp.body.includes('Retourner pour correction');
  const hasRejeter = detailResp.body.includes('Rejeter le dossier');
  const hasPDF = detailResp.body.includes('Télécharger la lettre signée');
  
  console.log('Has Valider button:', hasValider);
  console.log('Has Retourner button:', hasRetourner);
  console.log('Has Rejeter button:', hasRejeter);
  console.log('Has PDF link:', hasPDF);
  
  // Check if LettreEdition is present
  const hasLettreEdition = detailResp.body.includes('LettreEdition') || detailResp.body.includes('Enregistrer la lettre modifiée');
  console.log('Has LettreEdition:', hasLettreEdition);
  
  // Check signature URL in page
  const hasSignatureUrl = detailResp.body.includes('demo-signature.png');
  console.log('Has demo-signature.png:', hasSignatureUrl);
  
  // Check PDF URL
  const hasPDFUrl = detailResp.body.includes('demo-lettre.pdf');
  console.log('Has demo-lettre.pdf:', hasPDFUrl);
  
  // Test PDF download directly
  const pdfResp = await fetchWithCookie('/uploads/demo-lettre.pdf', cookie);
  console.log('\nDirect PDF download:', pdfResp.status, pdfResp.body.length, 'bytes');
  
  // Test signature download
  const sigResp = await fetchWithCookie('/uploads/demo-signature.png', cookie);
  console.log('Direct signature download:', sigResp.status);
  
  // Test PV image
  const pvResp = await fetchWithCookie('/uploads/demo-pv.jpg', cookie);
  console.log('Direct PV download:', pvResp.status);
}

test().catch(console.error);