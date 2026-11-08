import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const env={...process.env,GCM_INTERACTIVE:'never',GIT_TERMINAL_PROMPT:'0'};
const git=(args,input)=>execFileSync('git',args,{cwd:root,env,input,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
let token;
try {
  git(['config','credential.helper','manager']);
  let raw;
  try {raw=git(['credential','fill'],'protocol=https\nhost=github.com\n\n');} catch {throw new Error('github_login_required');}
  token=raw.match(/^password=(.+)$/m)?.[1].trim();raw='';
  if(!token) throw new Error('github_login_required');
  const api=async(path,{method='GET',body,allow404=false}={})=>{
    const r=await fetch('https://api.github.com'+path,{method,
      headers:{Authorization:'Bearer '+token,'User-Agent':'RIDO-CAR-website',Accept:'application/vnd.github+json',
        'X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},
      ...(body?{body:JSON.stringify(body)}:{})});
    if(allow404&&r.status===404) return null;
    if(!r.ok) throw new Error(`github_api_${r.status}:${path.split('?')[0]}`);
    return r.status===204?null:r.json();
  };
  const user=await api('/user');
  const statePath=root+'.publish-state.json';
  let state=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):null;
  if(state&&state.owner!==user.login) throw new Error('github_account_differs_from_site_owner');
  if(!state) {
    let name='rido-car-website';
    if(await api(`/repos/${user.login}/${name}`,{allow404:true})) name='rido-car-website-20261108';
    if(await api(`/repos/${user.login}/${name}`,{allow404:true})) throw new Error('site_repository_names_already_exist');
    const repo=await api('/user/repos',{method:'POST',body:{name,private:false,
      description:'الموقع التعريفي لرايدو كار RIDO CAR — منصة لطلب الرحلات في الأردن',auto_init:false}});
    state={owner:user.login,repo:repo.name,repository:repo.html_url,url:`https://${user.login.toLowerCase()}.github.io/${repo.name}/`};
    writeFileSync(statePath,JSON.stringify(state,null,2));
  }
  for(const [file,path] of [['index.html',''],['privacy.html','privacy.html']]) {
    const local=root+'site/'+file;
    let html=readFileSync(local,'utf8').replace(/\s*<link rel="canonical"[^>]*>/g,'')
      .replace(/\s*<meta property="og:(?:url|image)"[^>]*>/g,'');
    html=html.replace('</head>',`  <link rel="canonical" href="${state.url+path}">\n  <meta property="og:url" content="${state.url+path}">\n  <meta property="og:image" content="${state.url}assets/rido-logo.png">\n</head>`);
    writeFileSync(local,html);
  }
  git(['config','user.name',user.login]);
  git(['config','user.email',`${user.id}+${user.login}@users.noreply.github.com`]);
  let remote;try{remote=git(['remote','get-url','origin']);}catch{}
  const expected=`https://github.com/${state.owner}/${state.repo}.git`;
  if(remote&&remote!==expected) throw new Error('unexpected_git_remote');
  if(!remote) git(['remote','add','origin',expected]);
  git(['add','site','.github/workflows/pages.yml','.gitignore','README.md','tools']);
  const staged=git(['diff','--cached','--name-only']);
  if(staged) git(['commit','-m','Publish RIDO CAR Arabic website and privacy policy']);
  git(['push','-u','origin','main']);
  const base=`/repos/${state.owner}/${state.repo}`;
  let pages=await api(base+'/pages',{allow404:true});
  if(!pages) pages=await api(base+'/pages',{method:'POST',body:{build_type:'workflow'}});
  // Allow GitHub to ingest the freshly pushed workflow. The initial push also
  // starts it; a dispatch after Pages setup handles the first-publication race.
  for(let attempt=0;attempt<10;attempt++) {
    const workflow=await api(base+'/actions/workflows/pages.yml',{allow404:true});
    if(workflow) {
      await api(base+'/actions/workflows/pages.yml/dispatches',{method:'POST',body:{ref:'main'}});
      break;
    }
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  console.log(JSON.stringify({...state,status:'deployment_requested',pagesUrl:pages.html_url,actions:state.repository+'/actions'}));
} catch(e) {
  const message=String(e.message??'');
  const safe=/^(github_login_required|github_account_differs_from_site_owner|site_repository_names_already_exist|unexpected_git_remote|github_api_\d{3}:[/A-Za-z0-9_.-]+)$/.test(message)?message:'publish_incomplete_check_GitHub_access';
  console.error(JSON.stringify({published:false,reason:safe}));process.exitCode=1;
} finally {token=undefined;}
