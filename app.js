const content = document.getElementById('content');
const toast = document.getElementById('toast');
const sidebar = document.getElementById('sidebar');
let currentUser = null;
let activeMessages = [];
let activeChatId = null;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
function showToast(message){ toast.textContent=message; toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'),2400); }
function iconFor(title){ return {Writing:'✎',Coding:'</>',Research:'⌕',Brainstorm:'✦',Image:'▧',Summarize:'≡'}[title]||'✦'; }
async function api(url, options={}){
  const res = await fetch(url, {credentials:'same-origin', ...options, headers:{'Content-Type':'application/json', ...(options.headers||{})}});
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

const views={
chat(){return `<div class="hero">
  <div class="eyebrow">Your intelligent workspace</div><h1>Meet <span class="gradient">Nexrun AI</span></h1>
  <p>Think faster, create better, and turn ideas into results with your own AI workspace.</p>
  <div class="chat-box"><textarea id="prompt" placeholder="Ask Nexrun anything..."></textarea><div class="composer-bottom"><div class="composer-actions"><button class="pill">✦ Auto</button><button class="pill" id="upgradeInline">⚡ Upgrade</button></div><button class="send" id="send">↑</button></div></div>
  <div class="suggestions"><button class="suggestion" data-prompt="Write a professional email"><strong>✎ Write</strong><span>Create content quickly</span></button><button class="suggestion" data-prompt="Explain this topic simply"><strong>✦ Explain</strong><span>Make complex ideas easy</span></button><button class="suggestion" data-prompt="Help me build a website"><strong>&lt;/&gt; Code</strong><span>Build and debug code</span></button><button class="suggestion" data-prompt="Give me five creative ideas"><strong>⌁ Ideas</strong><span>Brainstorm anything</span></button></div>
  <div class="account-banner"><span><b>${esc(currentUser?.name||'User')}</b> · ${esc((currentUser?.plan||'free').toUpperCase())} plan</span><button class="pill" id="upgradeBanner">Upgrade to Pro</button></div>
</div>`},
chatPage(){return `<div class="chat-page"><div class="page-title"><h1>${esc(activeChatId?'Conversation':'New conversation')}</h1><p>Real AI responses are sent through your secure Node.js backend.</p></div><div class="chat-history" id="chatHistory"></div><div class="chat-box compact"><textarea id="prompt" placeholder="Message Nexrun AI..."></textarea><div class="composer-bottom"><div class="composer-actions"><button class="pill">✦ Auto</button><button class="pill" id="upgradeChat">⚡ Pro</button></div><button class="send" id="send">↑</button></div></div></div>`},
explore(){const tools=[['Writing','Write emails, posts, scripts and more.','Create polished text in seconds.'],['Coding','Generate, explain and debug code.','From simple scripts to web apps.'],['Research','Organize ideas and compare information.','Turn a question into a useful brief.'],['Brainstorm','Get fresh ideas for your next project.','Names, plans, concepts and strategies.'],['Summarize','Turn long text into key points.','Fast, clean and easy to understand.'],['Image','Create visual concepts from prompts.','Connect your image provider in the backend.']];return `<div class="page-title"><h1>Explore</h1><p>Choose a capability and start creating.</p></div><div class="cards">${tools.map(t=>`<button class="card tool-card" data-tool="${t[0]}"><div class="card-icon">${iconFor(t[0])}</div><h3>${t[0]}</h3><p>${t[1]}</p><small>${t[2]}</small></button>`).join('')}</div>`},
history(){return `<div class="page-title"><h1>History</h1><p>Your conversations are now stored in the Nexrun database.</p></div><input class="search" placeholder="Search chats..." id="historySearch"><div id="historyList"><div class="empty">Loading chats...</div></div>`},
projects(){return `<div class="page-title"><h1>Projects</h1><p>Keep your ideas and experiments organized.</p></div><div class="cards"><div class="card project"><div class="card-icon">＋</div><div><h3>New project</h3><p>Project support can be expanded with a dedicated database model.</p></div></div><div class="card project"><div class="card-icon">⌘</div><div><h3>Nexrun Website</h3><p>Full-stack product concept and UI.</p></div></div></div>`},
tools(){return `<div class="page-title"><h1>AI Tools</h1><p>Quick actions for common tasks.</p></div><div class="cards">${['Writing','Coding','Research','Brainstorm','Summarize','Image'].map(x=>`<button class="card tool-card" data-tool="${x}"><div class="card-icon">${iconFor(x)}</div><h3>${x}</h3><p>Open the ${x.toLowerCase()} assistant and begin.</p></button>`).join('')}</div>`},
images(){return `<div class="page-title"><h1>Image Studio</h1><p>UI is ready for an image-generation provider. This build keeps image generation separate from the text AI endpoint.</p></div><div class="card"><textarea id="imagePrompt" class="wide-textarea" placeholder="Describe an image..."></textarea><button class="new-chat" id="fakeImage">Generate concept</button><div id="imagePreview" style="margin-top:18px"></div></div>`},
settings(){return `<div class="page-title"><h1>Settings</h1><p>Manage your account and app preferences.</p></div><div class="settings card"><div class="setting"><div><strong>Account</strong><p>${esc(currentUser?.name)} · ${esc(currentUser?.email)}</p></div><span class="plan-badge">${esc((currentUser?.plan||'free').toUpperCase())}</span></div><div class="setting"><div><strong>Theme</strong><p>Use the Nexrun interface theme.</p></div><button class="toggle ${document.body.classList.contains('light')?'':'on'}" id="themeToggle"><i></i></button></div><div class="setting"><div><strong>Pro plan</strong><p>Unlock your configured paid plan through Razorpay.</p></div><button class="pill" id="settingsUpgrade">Upgrade</button></div><div class="setting"><div><strong>Session</strong><p>Sign out from this device.</p></div><button class="pill" id="logout">Sign out</button></div></div>`},
billing(){return `<div class="page-title"><h1>Upgrade</h1><p>Secure checkout powered by Razorpay.</p></div><div class="pricing-grid"><div class="card price-card"><span class="eyebrow">NEXRUN PRO</span><h2>₹<span id="priceAmount">499</span></h2><p>One-time demo upgrade. Change the amount or implement subscriptions in your backend when you're ready.</p><ul><li>Real AI API access</li><li>Database-backed chat history</li><li>Pro account status</li><li>Razorpay checkout</li></ul><button class="new-chat" id="payNow">Pay & Upgrade</button><small class="muted-note">Amount is controlled by PRO_PLAN_AMOUNT_INR on the server.</small></div></div>`}
};

function render(view='chat'){
  content.innerHTML = views[view] ? views[view]() : views.chat();
  document.querySelectorAll('.nav-item[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  bindView(view);
}
function bindView(view){
  if(view==='chat' || view==='chatPage') bindComposer();
  document.querySelectorAll('[data-tool]').forEach(b=>b.onclick=()=>{render('chatPage');setTimeout(()=>{document.getElementById('prompt').value=`Help me with ${b.dataset.tool.toLowerCase()}`;document.getElementById('prompt').focus();},0)});
  document.querySelectorAll('[data-prompt]').forEach(b=>b.onclick=()=>{activeMessages=[];render('chatPage');setTimeout(()=>{document.getElementById('prompt').value=b.dataset.prompt;document.getElementById('prompt').focus()},0)});
  document.getElementById('upgradeInline')?.addEventListener('click',()=>render('billing'));
  document.getElementById('upgradeBanner')?.addEventListener('click',()=>render('billing'));
  document.getElementById('upgradeChat')?.addEventListener('click',()=>render('billing'));
  if(view==='history') loadHistory();
  if(view==='settings'){
    document.getElementById('themeToggle')?.addEventListener('click',toggleTheme);
    document.getElementById('settingsUpgrade')?.addEventListener('click',()=>render('billing'));
    document.getElementById('logout')?.addEventListener('click',logout);
  }
  if(view==='images') document.getElementById('fakeImage')?.addEventListener('click',()=>{const p=document.getElementById('imagePrompt').value.trim()||'your idea';document.getElementById('imagePreview').innerHTML=`<div class="empty"><div style="font-size:40px">✦</div><strong>Concept saved</strong><p>“${esc(p)}”<br>Connect an image model to turn this prompt into a generated image.</p></div>`});
  if(view==='billing') loadBilling();
}

function appendMessage(role,text){
  const history=document.getElementById('chatHistory');
  if(!history)return;
  history.insertAdjacentHTML('beforeend',`<div class="msg ${role==='user'?'user':''}"><div class="msg-avatar">${role==='user'?'L':'N'}</div><div class="bubble">${esc(text).replace(/\n/g,'<br>')}</div></div>`);
  history.scrollTop=history.scrollHeight;
}
function redrawChat(){const h=document.getElementById('chatHistory');if(!h)return;h.innerHTML='';if(!activeMessages.length) appendMessage('assistant','Hi! I\'m Nexrun AI. What would you like to create today?');else activeMessages.forEach(m=>appendMessage(m.role,m.text));}
async function bindComposer(){
  redrawChat();
  const send=async()=>{
    const input=document.getElementById('prompt');const text=input?.value.trim();if(!text)return;
    input.disabled=true; appendMessage('user',text); activeMessages.push({role:'user',text}); input.value='';
    try{
      const data=await api('/api/chat',{method:'POST',body:JSON.stringify({message:text})});
      appendMessage('assistant',data.text); activeMessages.push({role:'assistant',text:data.text}); await saveActiveChat(text);
    }catch(e){appendMessage('assistant',`Error: ${e.message}`);showToast(e.message)}finally{input.disabled=false;input.focus()}
  };
  document.getElementById('send')?.addEventListener('click',send);
  document.getElementById('prompt')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
}
async function saveActiveChat(firstText){
  const title=(activeMessages.find(x=>x.role==='user')?.text||firstText||'New chat').slice(0,80);
  try{
    if(!activeChatId){const r=await api('/api/chats',{method:'POST',body:JSON.stringify({title,messages:activeMessages})});activeChatId=r.id}
    else await api(`/api/chats/${activeChatId}`,{method:'PUT',body:JSON.stringify({title,messages:activeMessages})});
  }catch(e){console.warn('Chat save failed',e)}
}
async function loadHistory(){
  try{const {chats}=await api('/api/chats');const list=document.getElementById('historyList');list.innerHTML=chats.length?chats.map(x=>`<button class="card history-card" data-chat-id="${x.id}"><strong>${esc(x.title)}</strong><p>${new Date(x.updated_at).toLocaleString()}</p></button>`).join(''):`<div class="empty">No conversations yet.</div>`;document.querySelectorAll('[data-chat-id]').forEach(b=>b.onclick=()=>openChat(b.dataset.chatId));
  }catch(e){showToast(e.message)}
}
async function openChat(id){try{const chat=await api(`/api/chats/${id}`);activeChatId=chat.id;activeMessages=chat.messages||[];render('chatPage')}catch(e){showToast(e.message)}}
async function loadBilling(){try{const data=await api('/api/payments/config');document.getElementById('priceAmount').textContent=data.amount}catch(e){showToast(e.message)}}
async function startPayment(){
  try{
    const order=await api('/api/payments/create-order',{method:'POST',body:'{}'});
    if(!window.Razorpay) throw new Error('Razorpay Checkout could not load. Check your internet connection.');
    const rzp=new Razorpay({key:order.keyId,amount:order.amount,currency:order.currency,name:'Nexrun AI',description:'Nexrun Pro',order_id:order.orderId,prefill:{name:currentUser.name,email:currentUser.email},theme:{color:'#7c5cff'},handler:async response=>{
      try{const verified=await api('/api/payments/verify',{method:'POST',body:JSON.stringify({orderId:response.razorpay_order_id,paymentId:response.razorpay_payment_id,signature:response.razorpay_signature})});currentUser=verified.user;showToast('Payment verified — Pro enabled');render('settings')}catch(e){showToast(e.message)}
    }});
    rzp.on('payment.failed',r=>showToast(r.error?.description||'Payment failed'));
    rzp.open();
  }catch(e){showToast(e.message)}
}
function toggleTheme(){document.body.classList.toggle('light');localStorage.setItem('nexrunTheme',document.body.classList.contains('light')?'light':'dark');showToast('Theme updated')}
async function logout(){try{await api('/api/auth/logout',{method:'POST',body:'{}'});currentUser=null;showAuth();}catch(e){showToast(e.message)}}

function showAuth(){
  document.body.classList.add('auth-mode');
  content.innerHTML=`<div class="auth-wrap"><div class="auth-card"><div class="brand auth-brand"><span class="brand-mark">N</span><span>Nexrun <b>AI</b></span></div><div class="auth-tabs"><button class="auth-tab active" data-auth="login">Sign in</button><button class="auth-tab" data-auth="signup">Create account</button></div><form id="authForm"><div id="nameField" class="field hidden"><label>Name</label><input id="authName" autocomplete="name"></div><div class="field"><label>Email</label><input id="authEmail" type="email" autocomplete="email" required></div><div class="field"><label>Password</label><input id="authPassword" type="password" minlength="8" autocomplete="current-password" required></div><button class="new-chat auth-submit" type="submit" id="authSubmit">Sign in</button><p id="authError" class="auth-error"></p></form><p class="auth-note">Your password is hashed on the server. AI and payment secrets never live in the browser.</p></div></div>`;
  let mode='login';
  const update=()=>{document.querySelectorAll('.auth-tab').forEach(x=>x.classList.toggle('active',x.dataset.auth===mode));document.getElementById('nameField').classList.toggle('hidden',mode==='login');document.getElementById('authName').required=mode==='signup';document.getElementById('authSubmit').textContent=mode==='login'?'Sign in':'Create account';document.getElementById('authError').textContent=''};
  document.querySelectorAll('.auth-tab').forEach(b=>b.onclick=()=>{mode=b.dataset.auth;update()});
  document.getElementById('authForm').onsubmit=async e=>{e.preventDefault();const error=document.getElementById('authError');error.textContent='';const payload={email:document.getElementById('authEmail').value,password:document.getElementById('authPassword').value};if(mode==='signup')payload.name=document.getElementById('authName').value;try{const data=await api(`/api/auth/${mode==='login'?'login':'signup'}`,{method:'POST',body:JSON.stringify(payload)});currentUser=data.user;document.body.classList.remove('auth-mode');render('chat');updateUserUI()}catch(err){error.textContent=err.message}};
}
function updateUserUI(){const mini=document.querySelector('.user-mini');if(mini)mini.innerHTML=`<div class="avatar">${esc((currentUser?.name||'U')[0].toUpperCase())}</div><div><strong>${esc(currentUser?.name||'User')}</strong><small>${esc((currentUser?.plan||'free').toUpperCase())} account</small></div><span>•••</span>`;const profile=document.querySelector('.profile-btn');if(profile)profile.textContent=(currentUser?.name||'U')[0].toUpperCase()}
async function init(){
  if(localStorage.getItem('nexrunTheme')==='light')document.body.classList.add('light');
  try{const data=await api('/api/auth/me');currentUser=data.user;document.body.classList.remove('auth-mode');updateUserUI();render('chat')}catch{showAuth()}
}

document.querySelectorAll('.nav-item[data-view]').forEach(b=>b.onclick=()=>{activeChatId=null;activeMessages=[];render(b.dataset.view);sidebar.classList.remove('open')});
document.getElementById('newChat').onclick=()=>{activeChatId=null;activeMessages=[];render('chat')};
document.getElementById('themeBtn').onclick=toggleTheme;
document.getElementById('menuBtn').onclick=()=>sidebar.classList.toggle('open');
// Payment button is delegated because billing view is rendered dynamically.
document.addEventListener('click',e=>{if(e.target.id==='payNow')startPayment()});
init();
