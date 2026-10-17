(function(){
  var $=function(id){return document.getElementById(id)};
  var mem={}; // fallback if storage is blocked
  function load(k,d){try{var v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return mem[k]!==undefined?mem[k]:d}}
  function save(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){mem[k]=v}}
  function drop(k){try{localStorage.removeItem(k)}catch(e){delete mem[k]}}

  // Decorative shelf
  var cols=['#B7832F','#7FB8AE','#E9E3D3','#C2574B','#3E7C79','#D9A850','#5C7A99','#E9E3D3','#8C4A3B','#9CC7B8'],sh=$('shelf'),html='';
  for(var i=0;i<22;i++){html+='<i style="--c:'+cols[(i*7)%cols.length]+';--h:'+(95+((i*37)%85))+'px"></i>'}
  sh.innerHTML=html;

  // Theme toggle
  $('themeBtn').onclick=function(){
    var r=document.documentElement,dark=r.getAttribute('data-theme')?r.getAttribute('data-theme')==='dark':matchMedia('(prefers-color-scheme:dark)').matches;
    r.setAttribute('data-theme',dark?'light':'dark');
  };

  // View switching
  var views={register:$('registerView'),login:$('loginView'),dash:$('dashView')};
  function show(name){
    for(var k in views)views[k].classList.toggle('hidden',k!==name);
    $('steps').classList.toggle('hidden',name==='dash');
    document.querySelector('.shell').classList.toggle('dash',name==='dash');
    document.querySelector('.card').classList.toggle('wide',name==='dash');
    $('tab-register').setAttribute('aria-selected',name==='register');
    $('tab-login').setAttribute('aria-selected',name==='login');
    $('tab-register').classList.toggle('done',name==='login'&&!!load('justRegistered',false));
  }
  document.querySelectorAll('[data-go]').forEach(function(b){b.onclick=function(){show(b.dataset.go)}});
  $('tab-register').onclick=function(){show('register')};
  $('tab-login').onclick=function(){show('login')};

  // Show/hide password
  document.querySelectorAll('[data-toggle]').forEach(function(b){
    b.onclick=function(){var i=$(b.dataset.toggle),h=i.type==='password';i.type=h?'text':'password';b.textContent=h?'Hide':'Show'}
  });

  // Helpers
  function setErr(id,msg){
    var e=document.querySelector('[data-for="'+id+'"]'),i=$(id);
    if(e)e.textContent=msg||'';
    if(i){if(msg)i.setAttribute('aria-invalid','true');else i.removeAttribute('aria-invalid')}
    return !msg;
  }
  function hash(pw,salt){
    var data=new TextEncoder().encode(salt+':'+pw);
    return crypto.subtle.digest('SHA-256',data).then(function(b){
      return Array.from(new Uint8Array(b)).map(function(x){return x.toString(16).padStart(2,'0')}).join('');
    });
  }
  function salt(){var a=new Uint8Array(12);crypto.getRandomValues(a);return Array.from(a).map(function(x){return x.toString(16).padStart(2,'0')}).join('')}

  // Password strength
  function score(p){var s=0;if(p.length>=8)s++;if(p.length>=12)s++;if(/[a-z]/.test(p)&&/[A-Z]/.test(p))s++;if(/\d/.test(p))s++;if(/[^A-Za-z0-9]/.test(p))s++;return s}
  $('rPw').addEventListener('input',function(){
    var s=score(this.value),bar=$('meterBar'),labels=['Too short','Weak','Fair','Good','Strong','Very strong'],col=['var(--err)','var(--err)','var(--brass)','var(--brass)','var(--ok)','var(--ok)'];
    bar.style.width=(this.value?Math.max(s,1)*20:0)+'%';bar.style.background=col[s];
    $('meterTxt').textContent=this.value?labels[s]:'At least 8 characters with a letter and a number.';
  });

  // REGISTER
  $('regForm').addEventListener('submit',function(ev){
    ev.preventDefault();
    var name=$('rName').value.trim(),sid=$('rSid').value.trim().toUpperCase(),email=$('rEmail').value.trim().toLowerCase(),
        dept=$('rDept').value,sem=$('rSem').value,pw=$('rPw').value,pw2=$('rPw2').value,users=load('ch_users',[]);
    var ok=true;
    ok=setErr('rName',name.length<2?'Enter your full name.':'')&&ok;
    ok=setErr('rSid',!/^[A-Z0-9\-\/]{4,20}$/.test(sid)?'Enter a valid student ID (4–20 letters or numbers).':users.some(function(u){return u.sid===sid})?'This student ID is already registered.':'')&&ok;
    ok=setErr('rEmail',!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?'Enter a valid email address.':users.some(function(u){return u.email===email})?'This email is already registered. Log in instead.':'')&&ok;
    ok=setErr('rDept',dept?'':'Choose your department.')&&ok;
    ok=setErr('rSem',sem?'':'Choose your semester.')&&ok;
    ok=setErr('rPw',pw.length<8?'Use at least 8 characters.':!/[A-Za-z]/.test(pw)||!/\d/.test(pw)?'Include at least one letter and one number.':'')&&ok;
    ok=setErr('rPw2',pw2!==pw?'Passwords do not match.':'')&&ok;
    if(!ok){var f=document.querySelector('#regForm [aria-invalid="true"]');if(f)f.focus();return}
    var s=salt();
    hash(pw,s).then(function(h){
      users.push({id:users.length+1,name:name,sid:sid,email:email,dept:dept,sem:sem,salt:s,hash:h,created:new Date().toISOString()});
      save('ch_users',users);save('justRegistered',true);
      $('regForm').reset();$('meterBar').style.width='0';$('meterTxt').textContent='At least 8 characters with a letter and a number.';
      show('login');
      $('lId').value=email;
      var b=$('loginBanner');b.className='banner ok';b.textContent='Account created. Log in to continue.';
      $('lPw').focus();
    });
  });

  // LOGIN
  var attempts=0,lockUntil=0;
  $('logForm').addEventListener('submit',function(ev){
    ev.preventDefault();
    var id=$('lId').value.trim().toLowerCase(),pw=$('lPw').value,b=$('loginBanner'),ok=true;
    ok=setErr('lId',id?'':'Enter your email or student ID.')&&ok;
    ok=setErr('lPw',pw?'':'Enter your password.')&&ok;
    if(!ok)return;
    if(Date.now()<lockUntil){b.className='banner bad';b.textContent='Too many failed attempts. Wait 30 seconds and try again.';return}
    var users=load('ch_users',[]),u=users.filter(function(x){return x.email===id||x.sid.toLowerCase()===id})[0];
    function fail(){
      attempts++;
      if(attempts>=5){lockUntil=Date.now()+30000;attempts=0;b.textContent='Too many failed attempts. Wait 30 seconds and try again.'}
      else b.textContent='Email, student ID or password is incorrect.';
      b.className='banner bad';
    }
    if(!u){fail();return}
    hash(pw,u.salt).then(function(h){
      if(h!==u.hash){fail();return}
      attempts=0;save('ch_session',{id:u.id});b.className='banner hidden';$('lPw').value='';
      openDash(u);
    });
  });

  function openDash(u){
    $('dHello').textContent='Hello, '+u.name.split(' ')[0];
    $('dProfile').textContent=u.sid+' · '+u.dept+' · Semester '+u.sem;
    show('dash');initShop(u);
  }
  $('logoutBtn').onclick=function(){drop('ch_session');$('loginBanner').className='banner ok';$('loginBanner').textContent='You are logged out.';show('login')};

  // ===== Store data: starts empty. Items are added by the admin. Item = [id, category, name, detail, buy price, rent price per 7 days (0 = not rentable), stock] =====
  var CATS={B:'Books',N:'Notes',C:'Calculators',S:'Stationery',L:'Lab and project',E:'Essentials'};
  var D=load('ch_items',[]);
  var cart=[],cat='ALL',q='',me=null,cartMsg='';
  function byId(id){return D.filter(function(x){return x[0]===id})[0]}
  function inr(n){return '₹'+n.toLocaleString('en-IN')}
  function rentP(r,d){return d===7?r:d===14?Math.round(r*1.8):Math.round(r*3.2)}
  function stockOf(it){var s=load('ch_stock',{});return it[6]-(s[it[0]]||0)}
  function due(d){var x=new Date();x.setDate(x.getDate()+d);return x.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
  function chips(){
    var t=[['ALL','All'],['B','Books'],['N','Notes'],['C','Calculators'],['S','Stationery'],['L','Lab and project'],['E','Essentials'],['ORD','My orders']],h='';
    t.forEach(function(c){h+='<button class="chip" type="button" data-cat="'+c[0]+'" aria-pressed="'+(cat===c[0])+'">'+c[1]+'</button>'});
    $('chips').innerHTML=h;
  }
  function view(){
    var h='';
    if(cat==='ORD'){
      var os=load('ch_orders',[]).filter(function(o){return o.uid===me.id}).reverse();
      if(!os.length)h='<p class="sub">No orders yet. Add items to your cart and place an order.</p>';
      os.forEach(function(o){
        h+='<div class="order"><b>Order #'+o.no+'</b> · '+o.date+' · '+o.status+'<br>';
        o.lines.forEach(function(l){h+='<div class="line"><span>'+l.name+' × '+l.qty+'<br><small>'+l.label+(l.due?' · return by '+l.due:'')+'</small></span><b>'+inr(l.amt)+'</b></div>'});
        h+='<div class="line"><b>Total</b><b>'+inr(o.total)+'</b></div></div>';
      });
      $('shopMain').innerHTML=h;return;
    }
    h='<div class="items">';var n=0;
    D.forEach(function(it){
      if(cat!=='ALL'&&it[1]!==cat)return;
      if(q&&(it[2]+' '+it[3]).toLowerCase().indexOf(q)<0)return;
      n++;var st=stockOf(it),r=it[5],o='<option value="b">Buy – '+inr(it[4])+'</option>';
      if(r)[7,14,30].forEach(function(d){o+='<option value="'+d+'">Rent '+d+' days – '+inr(rentP(r,d))+'</option>'});
      h+='<div class="item"><small>'+CATS[it[1]]+(r?' · Rentable':'')+'</small><h3>'+it[2]+'</h3><small>'+it[3]+'</small>'+
        '<div class="price">'+inr(it[4])+' <small>'+(it[1]==='N'?'Digital download':st>0?st+' in stock':'Out of stock')+'</small></div>'+
        '<select id="m'+it[0]+'" aria-label="Buy or rent '+it[2]+'">'+o+'</select>'+
        '<button class="btn" type="button" data-add="'+it[0]+'"'+(st<1?' disabled':'')+'>Add to cart</button>'+(me&&me.id===1?'<button class="link" type="button" data-del="'+it[0]+'">Remove item</button>':'')+'</div>';
    });
    h+='</div>';if(!n)h='<p class="sub">'+(D.length?'No items match your search.':'No items added yet. The admin will add what is available on campus, with prices.')+'</p>';
    $('shopMain').innerHTML=h;
  }
  function cartView(){
    var h='<h3>Your cart</h3>',t=0;
    if(cartMsg)h+='<div class="err">'+cartMsg+'</div>';
    if(!cart.length)h+='<p class="sub" style="margin:10px 0 0">Nothing yet. Add items to buy or rent.</p>';
    cart.forEach(function(c,i){
      var it=byId(c.id),p=c.mode==='b'?it[4]:rentP(it[5],+c.mode),a=p*c.qty;t+=a;
      h+='<div class="line"><div><b>'+it[2]+'</b><br><small>'+(c.mode==='b'?'Buy':'Rent '+c.mode+' days')+' · '+inr(p)+' each</small><br><span class="qty"><button type="button" data-q="'+i+'" data-d="-1" aria-label="Decrease">−</button> '+c.qty+' <button type="button" data-q="'+i+'" data-d="1" aria-label="Increase">+</button> <button type="button" data-rm="'+i+'">Remove</button></span></div><b>'+inr(a)+'</b></div>';
    });
    if(cart.length)h+='<div class="line"><b>Total</b><b>'+inr(t)+'</b></div><button class="btn" id="placeBtn" type="button" style="margin-top:12px">Place order</button>';
    $('cartBox').innerHTML=h;
  }
  function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
  function initShop(u){D=load('ch_items',[]);me=u;cart=[];cat='ALL';q='';cartMsg='';$('sQ').value='';$('adminBox').classList.toggle('hidden',u.id!==1);chips();view();cartView()}
  $('addForm').addEventListener('submit',function(e){
    e.preventDefault();
    var name=$('aName').value.trim(),price=parseFloat($('aPrice').value),rent=parseFloat($('aRent').value)||0,c2=$('aCat').value,er=$('aErr'),
        stock=$('aStock').value===''?NaN:parseInt($('aStock').value,10);
    if(name.length<2){er.textContent='Enter the item name.';return}
    if(isNaN(price)||price<0){er.textContent='Enter the buy price.';return}
    if(c2==='N')stock=999;
    else if(isNaN(stock)||stock<0){er.textContent='Enter the quantity in stock.';return}
    var id=D.reduce(function(m,x){return Math.max(m,x[0])},0)+1;
    D.push([id,c2,esc(name),esc($('aDet').value.trim()),Math.round(price),Math.round(rent),stock]);
    save('ch_items',D);er.textContent='';$('addForm').reset();view();
  });
  $('sQ').addEventListener('input',function(){q=this.value.trim().toLowerCase();if(cat==='ORD')cat='ALL';chips();view()});
  $('chips').addEventListener('click',function(e){var b=e.target.closest('[data-cat]');if(!b)return;cat=b.dataset.cat;chips();view()});
  $('shopMain').addEventListener('click',function(e){
    var d=e.target.closest('[data-del]');
    if(d){D=D.filter(function(x){return x[0]!==+d.dataset.del});save('ch_items',D);view();return}
    var b=e.target.closest('[data-add]');if(!b)return;
    var id=+b.dataset.add,m=$('m'+id).value,it=byId(id),c=cart.filter(function(x){return x.id===id&&x.mode===m})[0];
    cartMsg='';
    if(c){if(c.qty>=stockOf(it)){cartMsg='Only '+stockOf(it)+' of '+it[2]+' in stock.';cartView();return}c.qty++}else cart.push({id:id,mode:m,qty:1});
    cartView();
  });
  $('cartBox').addEventListener('click',function(e){
    var t=e.target;cartMsg='';
    if(t.dataset.q!==undefined){var c=cart[+t.dataset.q];c.qty+=+t.dataset.d;if(c.qty<1)cart.splice(+t.dataset.q,1);cartView()}
    else if(t.dataset.rm!==undefined){cart.splice(+t.dataset.rm,1);cartView()}
    else if(t.id==='placeBtn'){
      var need={},bad=null;
      cart.forEach(function(c){need[c.id]=(need[c.id]||0)+c.qty});
      for(var id in need){var it=byId(+id);if(need[id]>stockOf(it)){bad=it;break}}
      if(bad){cartMsg='Not enough stock for '+bad[2]+'. Reduce the quantity.';cartView();return}
      var stock=load('ch_stock',{}),orders=load('ch_orders',[]),total=0,lines=[];
      for(var k in need)stock[k]=(stock[k]||0)+need[k];
      cart.forEach(function(c){
        var it=byId(c.id),rent=c.mode!=='b',p=rent?rentP(it[5],+c.mode):it[4];total+=p*c.qty;
        lines.push({name:it[2],qty:c.qty,amt:p*c.qty,label:rent?'Rent '+c.mode+' days':'Buy',due:rent?due(+c.mode):''});
      });
      orders.push({no:1001+orders.length,uid:me.id,date:new Date().toLocaleDateString('en-IN'),status:'Confirmed',lines:lines,total:total});
      save('ch_stock',stock);save('ch_orders',orders);cart=[];cat='ORD';chips();view();cartView();
    }
  });

  // Restore session
  var sess=load('ch_session',null);
  if(sess){var u=load('ch_users',[]).filter(function(x){return x.id===sess.id})[0];if(u)openDash(u)}
  else if(load('ch_users',[]).length&&false){show('login')}
})();
