const cfg=window.NADIA_SUPABASE||{};
const sb=(window.supabase&&cfg.url&&cfg.anonKey)?supabase.createClient(cfg.url,cfg.anonKey):null;
function readStoredList(key){try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value:[]}catch(_){localStorage.removeItem(key);return []}}
let cart=readStoredList('nadia_cart');
let wishlist=readStoredList('nadia_wishlist');
let allProducts=[];
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const money=v=>v==null?t('السعر يضاف من لوحة الإدارة','Price added from admin'):new Intl.NumberFormat(lang==='ar'?'ar-EG':'en-EG',{style:'currency',currency:'EGP',maximumFractionDigits:2}).format(Number(v));
const pname=p=>lang==='ar'?(p.name_ar||p.name_en):(p.name_en||p.name_ar);
function safe(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function toast(msg){let x=$('#toast');if(!x){x=document.createElement('div');x.id='toast';x.className='toast';document.body.append(x)}x.textContent=msg;x.classList.remove('hidden');setTimeout(()=>x.classList.add('hidden'),2200)}
function syncBrand(){const file='nadias-logo-transparent.png';$$('[data-brand-logo]').forEach(i=>{i.src=file;i.alt=lang==='ar'?'عطور نادية':"Nadia's Perfume Cart"})}
function applyLang(){
  syncBrand();renderProducts();renderCart();renderWishlistCount();renderProductPage();renderCheckout();updateWhatsApp();
}
document.addEventListener('languagechange',applyLang);
function productImage(p){return p.image_url||p.image||''}
async function loadProducts(){let rows=[];if(sb){const {data,error}=await sb.from('products').select('*').eq('active',true).order('created_at');if(!error&&data)rows=data}if(!rows.length)rows=(window.NADIA_PRODUCTS||[]).map(x=>({...x,price:null,stock:null,image_url:null}));allProducts=rows;renderProducts();renderCart();renderProductPage();renderCheckout();updateWhatsApp()}
function filteredProducts(){let rows=[...allProducts];const q=($('#searchProducts')?.value||'').trim().toLowerCase();const filter=$('#productFilter')?.value||'all';if(q)rows=rows.filter(p=>[p.name_ar,p.name_en,p.description_ar,p.description_en,p.slug].some(v=>String(v||'').toLowerCase().includes(q)));if(filter==='available')rows=rows.filter(p=>p.stock==null||Number(p.stock)>0);if(filter==='wishlist')rows=rows.filter(p=>wishlist.includes(p.slug));return rows}
function renderProducts(){const el=$('#productGrid');if(!el)return;const rows=filteredProducts();el.innerHTML=rows.length?rows.map(p=>{const img=productImage(p);const out=p.stock!=null&&Number(p.stock)<=0;return `<article class="card"><button class="wish ${wishlist.includes(p.slug)?'active':''}" onclick="toggleWish('${safe(p.slug)}')" aria-label="${t('المفضلة','Wishlist')}" aria-pressed="${wishlist.includes(p.slug)}">♥</button><a href="product.html?slug=${encodeURIComponent(p.slug)}"><div class="product-media">${img?`<img src="${safe(img)}" alt="${safe(pname(p))}">`:safe(pname(p).slice(0,1))}</div><h3>${safe(pname(p))}</h3></a><div class="meta">${money(p.price)}</div><div class="stock ${out?'out':''}">${out?t('غير متوفر حالياً','Currently unavailable'):t('متوفر حسب المخزون','Availability subject to stock')}</div><div class="row"><button class="btn gold" ${out?'disabled':''} onclick="addToCart('${safe(p.slug)}')">${t('أضف للسلة','Add to cart')}</button><a class="btn soft" href="product.html?slug=${encodeURIComponent(p.slug)}">${t('التفاصيل','Details')}</a><a class="btn soft product-inquiry" href="${safe(whatsappUrl(p))}" target="_blank" rel="noopener">${t('استفسر عبر واتساب','Ask on WhatsApp')}</a></div></article>`}).join(''):`<div class="panel">${t('لا توجد نتائج','No products found')}</div>`}
function toggleWish(slug){wishlist=wishlist.includes(slug)?wishlist.filter(x=>x!==slug):[...wishlist,slug];localStorage.setItem('nadia_wishlist',JSON.stringify(wishlist));renderProducts();renderWishlistCount()}
function renderWishlistCount(){$$('[data-wish-count]').forEach(x=>x.textContent=wishlist.length)}
function addToCart(slug,qty=1){const p=allProducts.find(x=>x.slug===slug);if(p?.stock!=null&&Number(p.stock)<=0)return toast(t('المنتج غير متوفر','Product unavailable'));const f=cart.find(x=>x.slug===slug);if(f)f.qty+=Number(qty)||1;else cart.push({slug,qty:Number(qty)||1});saveCart();openCart();toast(t('تمت الإضافة للسلة','Added to bag'))}
function changeQty(slug,d){const x=cart.find(i=>i.slug===slug);if(!x)return;x.qty=Math.max(1,x.qty+d);saveCart()}
function removeItem(slug){cart=cart.filter(x=>x.slug!==slug);saveCart()}
function saveCart(){localStorage.setItem('nadia_cart',JSON.stringify(cart));renderCart();renderCheckout()}
function cartTotal(){return cart.reduce((sum,i)=>{const p=allProducts.find(x=>x.slug===i.slug);return sum+(p?.price!=null?Number(p.price)*i.qty:0)},0)}
function renderCart(){$$('[data-cart-count]').forEach(x=>x.textContent=cart.reduce((a,b)=>a+b.qty,0));const el=$('#cartItems');if(!el)return;el.innerHTML=cart.length?cart.map(i=>{const p=allProducts.find(x=>x.slug===i.slug)||{slug:i.slug,name_ar:i.slug,name_en:i.slug};const img=productImage(p);return `<div class="cart-item">${img?`<img class="cart-thumb" src="${safe(img)}" alt="${safe(pname(p))}">`:`<div class="cart-thumb"></div>`}<div><b>${safe(pname(p))}</b><br><small>${money(p.price)}</small><div class="row"><button aria-label="${t('تغيير الكمية','Change quantity')}" onclick="changeQty('${safe(i.slug)}',-1)">−</button><span>${i.qty}</span><button aria-label="${t('تغيير الكمية','Change quantity')}" onclick="changeQty('${safe(i.slug)}',1)">+</button></div></div><button aria-label="${t('إزالة المنتج','Remove item')}" onclick="removeItem('${safe(i.slug)}')">×</button></div>`}).join('')+`<div class="cart-total"><span>${t('الإجمالي','Total')}</span><span>${money(cartTotal())}</span></div>`:t('السلة فارغة','Your bag is empty')}
function ensureBackdrop(){let el=$('#uiBackdrop');if(!el){el=document.createElement('button');el.id='uiBackdrop';el.className='ui-backdrop hidden';el.type='button';el.setAttribute('aria-label',t('إغلاق','Close'));el.addEventListener('click',closePanels);document.body.append(el)}return el}
function setPanelState(panel,open,triggerSelector){if(!panel)return;panel.classList.toggle('hidden',!open);$(triggerSelector).forEach(btn=>btn.setAttribute('aria-expanded',String(open)))}
function syncPanelUi(){const open=!$('#cartDrawer')?.classList.contains('hidden')||!$('#mobileMenu')?.classList.contains('hidden');ensureBackdrop().classList.toggle('hidden',!open);document.body.classList.toggle('ui-locked',open)}
function openCart(){closeMenu();setPanelState($('#cartDrawer'),true,'[onclick="openCart()"]');syncPanelUi();$('#cartDrawer button')?.focus()}
function closeCart(){setPanelState($('#cartDrawer'),false,'[onclick="openCart()"]');syncPanelUi()}
function openMenu(){closeCart();setPanelState($('#mobileMenu'),true,'[onclick="openMenu()"]');syncPanelUi();$('#mobileMenu button')?.focus()}
function closeMenu(){setPanelState($('#mobileMenu'),false,'[onclick="openMenu()"]');syncPanelUi()}
function closePanels(){setPanelState($('#cartDrawer'),false,'[onclick="openCart()"]');setPanelState($('#mobileMenu'),false,'[onclick="openMenu()"]');syncPanelUi()}
document.addEventListener('keydown',event=>{if(event.key==='Escape')closePanels()});
async function loadAnnouncement(){if(!sb)return;const {data}=await sb.from('announcements').select('*').eq('active',true).order('updated_at',{ascending:false}).limit(1).maybeSingle();const el=$('#announcement');if(el&&data){el.dataset.ar=data.text_ar||'';el.dataset.en=data.text_en||'';el.textContent=lang==='ar'?data.text_ar:data.text_en;el.classList.remove('hidden')}}
function renderProductPage(){const el=$('#productDetail');if(!el||!allProducts.length)return;const slug=new URLSearchParams(location.search).get('slug');const p=allProducts.find(x=>x.slug===slug);if(!p){el.innerHTML=`<div class="panel">${t('العطر غير موجود','Perfume not found')}</div>`;return}const previousQty=$('#detailQty')?.value||'1';const img=productImage(p),desc=lang==='ar'?(p.description_ar||''):(p.description_en||'');const size=p.size||p.size_ml||'';el.innerHTML=`<div class="product-media">${img?`<img src="${safe(img)}" alt="${safe(pname(p))}">`:safe(pname(p).slice(0,1))}</div><div><div class="eyebrow">${t('عطور نادية','NADIA’S PERFUME CART')}</div><h2>${safe(pname(p))}</h2><div class="price">${money(p.price)}</div>${size?`<div class="chips"><span class="chip">${safe(size)}${String(size).match(/^\d+$/)?t(' مل',' ml'):''}</span></div>`:''}<p>${desc?safe(desc):t('سيظهر وصف العطر الحقيقي عند إضافته من لوحة الإدارة.','The real perfume description will appear when added from the admin dashboard.')}</p><div class="row"><input id="detailQty" aria-label="${t('الكمية','Quantity')}" class="qty" type="number" min="1" value="${safe(previousQty)}"><button class="btn gold" onclick="addToCart('${safe(p.slug)}',document.getElementById('detailQty').value)">${t('أضف للسلة','Add to cart')}</button><button class="btn soft" onclick="toggleWish('${safe(p.slug)}')">♥ ${t('المفضلة','Wishlist')}</button></div></div>`}
function renderCheckout(){const el=$('#orderSummary');if(!el)return;el.innerHTML=cart.length?cart.map(i=>{const p=allProducts.find(x=>x.slug===i.slug)||{name_ar:i.slug,name_en:i.slug};return `<div class="summary-line"><span>${safe(pname(p))} × ${i.qty}</span><span>${p.price!=null?money(Number(p.price)*i.qty):'—'}</span></div>`}).join('')+`<div class="cart-total"><span>${t('الإجمالي','Total')}</span><span>${money(cartTotal())}</span></div>`:t('السلة فارغة','Your bag is empty')}
async function submitOrder(e){e.preventDefault();if(!cart.length)return toast(t('السلة فارغة','Your bag is empty'));if(!sb)return toast(t('تعذر الاتصال بقاعدة البيانات','Database connection unavailable'));const f=new FormData(e.target);const payload={customer_name:f.get('customer_name'),phone:f.get('phone'),email:f.get('email'),governorate:f.get('governorate'),city:f.get('city'),address:f.get('address'),notes:f.get('notes'),gift_message:f.get('gift_message'),language:lang,items:cart.map(i=>({slug:i.slug,qty:i.qty}))};const btn=e.target.querySelector('[type=submit]');btn.disabled=true;btn.textContent=t('جاري إرسال الطلب…','Submitting…');const {data,error}=await sb.rpc('create_store_order',{payload});btn.disabled=false;btn.textContent=t('تأكيد الطلب','Place order');if(error){console.error(error);return toast(t('تعذر إرسال الطلب. راجع إعداد قاعدة البيانات.','Could not submit order. Check database setup.'))}cart=[];saveCart();e.target.reset();$('#checkoutSuccess').innerHTML=`<div class="success"><span data-ar="تم استلام طلبك. رقم الطلب: " data-en="Order received. Order number: ">${t('تم استلام طلبك. رقم الطلب: ','Order received. Order number: ')}</span><b>${safe(data?.order_number||data||'')}</b></div>`;window.scrollTo({top:0,behavior:'smooth'})}
document.addEventListener('DOMContentLoaded',()=>{ensureBackdrop();$('[onclick="openMenu()"]').forEach(btn=>{btn.setAttribute('aria-controls','mobileMenu');btn.setAttribute('aria-expanded','false')});$('[onclick="openCart()"]').forEach(btn=>{btn.setAttribute('aria-controls','cartDrawer');btn.setAttribute('aria-expanded','false')});$('#mobileMenu a').forEach(link=>link.addEventListener('click',closeMenu));if(new URLSearchParams(location.search).get('view')==='wishlist'&&$('#productFilter'))$('#productFilter').value='wishlist';applyLang();loadProducts();loadAnnouncement();$('#searchProducts')?.addEventListener('input',renderProducts);$('#productFilter')?.addEventListener('change',renderProducts);$('#checkoutForm')?.addEventListener('submit',submitOrder)});

async function submitEventRequest(e){
  e.preventDefault();
  if(!sb)return toast(t('تعذر الاتصال بقاعدة البيانات','Database connection unavailable'));
  const f=new FormData(e.target);
  const payload={
    customer_name:f.get('customer_name'),phone:f.get('phone'),email:f.get('email'),
    event_type:f.get('event_type'),event_date:f.get('event_date'),event_time:f.get('event_time'),
    city:f.get('city'),venue:f.get('venue'),guest_count:f.get('guest_count'),
    requirements:f.get('requirements'),notes:f.get('notes'),language:lang,
    contact_consent:f.get('contact_consent')==='on'
  };
  const btn=e.target.querySelector('[type=submit]');btn.disabled=true;btn.textContent=t('جاري إرسال الطلب…','Sending…');
  const {data,error}=await sb.rpc('create_event_request',{payload});
  btn.disabled=false;btn.textContent=t('إرسال طلب التنسيق','Send coordination request');
  if(error){console.error(error);return toast(t('تعذر إرسال الطلب. راجع إعداد قاعدة البيانات.','Could not send request. Check database setup.'))}
  e.target.reset();
  const box=document.getElementById('eventSuccess');
  if(box)box.innerHTML=`<div class="success"><span data-ar="تم استلام طلبك. رقم الطلب: " data-en="Request received. Reference: ">${t('تم استلام طلبك. رقم الطلب: ','Request received. Reference: ')}</span><b>${safe(data?.request_number||data||'')}</b></div>`;
  window.scrollTo({top:document.getElementById('eventBooking')?.offsetTop||0,behavior:'smooth'});
}
document.addEventListener('DOMContentLoaded',()=>{document.getElementById('eventForm')?.addEventListener('submit',submitEventRequest)});

function rememberViewed(slug){
  if(!slug)return;
  let v=readStoredList('nadia_recent').filter(x=>x!==slug);
  v.unshift(slug); localStorage.setItem('nadia_recent',JSON.stringify(v.slice(0,6)));
}
document.addEventListener('DOMContentLoaded',()=>{
  if(location.pathname.endsWith('product.html')){
    const slug=new URLSearchParams(location.search).get('slug'); rememberViewed(slug);
  }
});




// Only public product names are included; form contents are never copied to WhatsApp.
function whatsappUrl(product){
  const name=product?pname(product):'';
  const isEvent=location.pathname.endsWith('/event-cart.html');
  const message=name?t(`مرحباً عطور نادية، أود الاستفسار عن عطر «${name}».`,`Hello Nadia’s Perfume Cart, I would like to ask about “${name}”.`):
    isEvent?t('مرحباً عطور نادية، أود الاستفسار عن حجز عربة العطور لمناسبتي.','Hello Nadia’s Perfume Cart, I would like to enquire about booking the perfume cart for my event.'):
    t('مرحباً عطور نادية، أود الاستفسار عن العطور.','Hello Nadia’s Perfume Cart, I would like to enquire about your perfumes.');
  return 'https://wa.me/201112564000?text='+encodeURIComponent(message);
}
function updateWhatsApp(){
  const link=document.getElementById('floatingWhatsApp');if(!link)return;
  const slug=location.pathname.endsWith('/product.html')?new URLSearchParams(location.search).get('slug'):null;
  const product=slug?allProducts.find(p=>p.slug===slug):null;
  link.href=whatsappUrl(product);
  const label=product?t('استفسر عن هذا العطر','Ask about this perfume'):t('تواصل عبر واتساب','Chat on WhatsApp');
  link.setAttribute('aria-label',label);link.title=label;
  document.getElementById('floatingWhatsAppLabel').textContent=t('واتساب','WhatsApp');
}
