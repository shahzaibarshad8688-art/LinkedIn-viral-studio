'use strict';
/* LinkedIn Viral Studio — secure backend (zero dependencies, Node 18+).
   Holds the Client Secret and member tokens SERVER-SIDE ONLY. The browser only gets an HttpOnly session cookie. */
const http=require('http'),fs=require('fs'),path=require('path'),crypto=require('crypto');
try{fs.readFileSync(path.join(__dirname,'.env'),'utf8').split(/\r?\n/).forEach(l=>{const m=/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l);if(m&&!(m[1] in process.env))process.env[m[1]]=m[2].replace(/^["']|["']$/g,'')})}catch{}
const E=process.env,PORT=+E.PORT||3000,DEV=E.NODE_ENV!=='production',ID=E.LINKEDIN_CLIENT_ID,SECRET=E.LINKEDIN_CLIENT_SECRET,
 REDIRECT=E.LINKEDIN_REDIRECT_URI||`http://localhost:${PORT}/auth/linkedin/callback`,VER=E.LINKEDIN_API_VERSION||'202608',
 ORIGIN=new URL(REDIRECT).origin,SECURE=ORIGIN.startsWith('https'),API='https://api.linkedin.com',CONFIGURED=!!(ID&&SECRET);
const dlog=(...a)=>{if(DEV)console.log('[dev]',...a)};           // never pass tokens/secrets/headers here
const sessions=new Map();                                          // sid -> {state,token,exp,sub,name,picture,last}
setInterval(()=>{const n=Date.now();for(const[k,s]of sessions)if((s.exp&&s.exp<n)||n-(s.t||n)>864e5*7)sessions.delete(k)},6e4).unref();
const cookie=r=>Object.fromEntries((r.headers.cookie||'').split(/;\s*/).filter(Boolean).map(c=>{const i=c.indexOf('=');return[c.slice(0,i),c.slice(i+1)]}));
function session(req,res,create){let sid=cookie(req).sid,s=sid&&sessions.get(sid);if(!s&&create){sid=crypto.randomBytes(32).toString('hex');s={t:Date.now()};sessions.set(sid,s);res.setHeader('Set-Cookie',`sid=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800${SECURE?'; Secure':''}`)}if(s)s.t=Date.now();return s}
const json=(res,code,o)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(o))};
const body=(req,max)=>new Promise((ok,no)=>{let n=0;const c=[];req.on('data',d=>{n+=d.length;if(n>max){no(new Error('too large'));req.destroy()}else c.push(d)});req.on('end',()=>ok(Buffer.concat(c)));req.on('error',no)});
const hdrs=t=>({Authorization:'Bearer '+t,'Linkedin-Version':VER,'X-Restli-Protocol-Version':'2.0.0'});
/* "little text" format: reserved chars must be escaped or LinkedIn truncates the post; hashtags (#word) stay live */
const esc=t=>t.replace(/(#[\p{L}\p{N}_]+)|[\\|{}@\[\]()<>*_~#]/gu,(m,h)=>h||'\\'+m);
class Fail extends Error{constructor(code,detail){super(code);this.code=code;this.detail=detail}}
async function li(url,opt,code){let r;try{r=await fetch(url,opt)}catch(e){throw new Fail(code,'network: '+e.message)}
 if(r.status===401)throw new Fail('expired','401');if(!r.ok){let b='';try{b=(await r.text()).slice(0,600)}catch{}throw new Fail(code,`${r.status} ${b}`)}return r}
const mem=s=>s&&s.token&&s.exp>Date.now();
async function callback(req,res,u){const s=session(req,res,false),q=u.searchParams,back=(k)=>{res.writeHead(302,{Location:'/?li='+k});res.end()};
 if(!s||!s.state||q.get('state')!==s.state){dlog('state mismatch');return back('error')}
 const st=s.state;delete s.state;if(q.get('error')||!q.get('code')){dlog('authorization denied:',q.get('error'));return back('error')}
 try{const r=await li('https://www.linkedin.com/oauth/v2/accessToken',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',code:q.get('code'),client_id:ID,client_secret:SECRET,redirect_uri:REDIRECT})},'auth'),t=await r.json();
  const p=await(await li(API+'/v2/userinfo',{headers:{Authorization:'Bearer '+t.access_token}},'auth')).json();
  if(!p.sub)throw new Fail('auth','no sub');Object.assign(s,{token:t.access_token,exp:Date.now()+(t.expires_in||5183999)*1e3,sub:p.sub,name:p.name||[p.given_name,p.family_name].filter(Boolean).join(' '),picture:p.picture||''});dlog('connected member',p.sub);back('connected')}
 catch(e){dlog('callback failed:',e.code,e.detail||e.message);back('error')}}
async function publish(req,res){const s=session(req,res,false);if(!mem(s))return json(res,401,{ok:false,code:'expired'});
 if(Date.now()-(s.lastPub||0)<8000)return json(res,429,{ok:false,code:'rate'});
 let d;try{d=JSON.parse((await body(req,12e6)).toString())}catch{return json(res,400,{ok:false,code:'bad_request'})}
 const text=String(d.text||'').trim(),m=/^data:(image\/(?:png|jpeg));base64,([A-Za-z0-9+/=]+)$/.exec(d.image||'');
 if(!text||text.length>2800||!m)return json(res,400,{ok:false,code:'bad_request'});
 const img=Buffer.from(m[2],'base64'),png=img.slice(0,4).toString('hex')==='89504e47',jpg=img.slice(0,3).toString('hex')==='ffd8ff';
 if(!(png||jpg)||img.length>8e6)return json(res,400,{ok:false,code:'bad_request'});
 s.lastPub=Date.now();const author='urn:li:person:'+s.sub;let urn;
 try{const init=await(await li(API+'/rest/images?action=initializeUpload',{method:'POST',headers:{...hdrs(s.token),'Content-Type':'application/json'},body:JSON.stringify({initializeUploadRequest:{owner:author}})},'upload')).json();
  const v=init.value||{};if(!v.uploadUrl||!v.image)throw new Fail('upload','no uploadUrl');urn=v.image;
  await li(v.uploadUrl,{method:'PUT',headers:{Authorization:'Bearer '+s.token,'Content-Type':png?'image/png':'image/jpeg'},body:img},'upload');
  const r=await li(API+'/rest/posts',{method:'POST',headers:{...hdrs(s.token),'Content-Type':'application/json'},body:JSON.stringify({author,commentary:esc(text),visibility:'PUBLIC',distribution:{feedDistribution:'MAIN_FEED',targetEntities:[],thirdPartyDistributionChannels:[]},content:{media:{title:String(d.title||'LinkedIn post').slice(0,100),id:urn,altText:String(d.alt||'').slice(0,300)}},lifecycleState:'PUBLISHED',isReshareDisabledByAuthor:false})},'publish');
  const id=r.headers.get('x-restli-id');if(!id)throw new Fail('publish','no post id in response');
  json(res,200,{ok:true,id,url:'https://www.linkedin.com/feed/update/'+encodeURIComponent(id)+'/'})}
 catch(e){dlog('publish failed:',e.code,e.detail||e.message);json(res,e.code==='expired'?401:502,{ok:false,code:e.code||'publish'})}}
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,ORIGIN),p=u.pathname;
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.licdn.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
 if(req.method==='GET'&&(p==='/'||p==='/index.html')){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(fs.readFileSync(path.join(__dirname,'index.html')))}
 if(req.method==='GET'&&p==='/auth/linkedin'){if(!CONFIGURED){res.writeHead(302,{Location:'/?li=config'});return res.end()}const s=session(req,res,true);s.state=crypto.randomBytes(24).toString('hex');
  res.writeHead(302,{Location:'https://www.linkedin.com/oauth/v2/authorization?'+new URLSearchParams({response_type:'code',client_id:ID,redirect_uri:REDIRECT,state:s.state,scope:'openid profile w_member_social'})});return res.end()}
 if(req.method==='GET'&&p==='/auth/linkedin/callback')return callback(req,res,u);
 if(req.method==='GET'&&p==='/api/linkedin/status'){const s=session(req,res,false),ok=mem(s);return json(res,200,{configured:CONFIGURED,connected:!!ok,name:ok?s.name:'',picture:ok?s.picture:'',expired:!!(s&&s.token&&!ok)})}
 if(req.method==='POST'&&p.startsWith('/api/')){                       // CSRF/CORS: same-origin only, no CORS headers are ever sent
  if(req.headers.origin!==ORIGIN||req.headers['x-requested-with']!=='studio')return json(res,403,{ok:false,code:'forbidden'});
  if(p==='/api/linkedin/publish')return publish(req,res);
  if(p==='/api/linkedin/disconnect'){const sid=cookie(req).sid,s=sessions.get(sid);if(s&&s.token&&CONFIGURED)fetch('https://www.linkedin.com/oauth/v2/revoke',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:ID,client_secret:SECRET,token:s.token})}).catch(()=>{});sessions.delete(sid);return json(res,200,{ok:true})}}
 res.writeHead(404);res.end('Not found')}catch(e){dlog('server error',e.message);if(!res.headersSent)res.writeHead(500);res.end()}});
server.listen(PORT,()=>{console.log(`LinkedIn Viral Studio → ${ORIGIN.replace(/:\d+$/,'')}:${PORT} (LinkedIn ${CONFIGURED?'configured':'NOT configured — copy .env.example to .env'})`)});
