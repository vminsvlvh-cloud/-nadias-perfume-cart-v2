const cfg=window.NADIA_SUPABASE||{};
const sb=(window.supabase&&cfg.url&&cfg.anonKey)?supabase.createClient(cfg.url,cfg.anonKey):null;
function readStoredList(key){try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value:[]}catch(_){return []}}
let cart=readStoredList('nadia_cart').filter(i=>i&&typeof i.slug==='string').map(i=>({slug:i.slug,qty:Math.min(100,Math.max(1,Math.floor(Number(i.qty)||1)))}));
let wishlist=readStoredList('nadia_wishlist').filter(i=>typeof i==='string');
let allProducts=[],productsLoaded=false;
const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);
const money=(v,storedCurrency)=>{if(v==null)return t('استفسر عن السعر','Ask for the price');const currency=storedCurrency||window.NADIA_CMS_SETTINGS?.currency||'EGP';try{return new Intl.NumberFormat(lang==='ar'?'ar-EG':'en-GB',{style:'currency',currency,maximumFractionDigits:2}).format(Number(v))}catch(_){return Number(v).toFixed(2)+' '+currency}};
const pname=p=>lang==='ar'?(p.name_ar||p.name_en):(p.name_en||p.name_ar);
function safe(v=''){return String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function toast(msg){let x=$('#toast');if(!x){x=document.createElement('div');x.id='toast';x.className='toast';document.body.append(x)}x.textContent=msg;x.classList.remove('hidden');setTimeout(()=>x.classList.add('hidden'),2200)}
function syncBrand(){const file='nadias-logo-transparent.png';$$('[data-brand-logo]').forEach(i=>{i.src=file;i.alt=lang==='ar'?'عطور نادية':"Nadia's Perfume Cart"})}
function applyLang(){
  syncBrand();renderProducts();renderCart();renderWishlistCount();renderProductPage();renderCheckout();updateWhatsApp();
}
document.addEventListener('languagechange',applyLang);
function productImage(p){
  const remote=String(p?.image_url||'').trim();
  if(remote && /^https:\/\//i.test(remote)) return remote;
  return p?.image||'assets/products/nadias-product-bottle.webp';
}
function productImgTag(p,className='',extra=''){
  const src=safe(productImage(p));
  const fallback='assets/products/nadias-product-bottle.webp';
  return `<img ${className?`class="${className}"`:''} src="${src}" alt="${safe(pname(p))}" loading="lazy" decoding="async" ${extra} onerror="if(this.dataset.fallback!=='1'){this.dataset.fallback='1';this.src='${fallback}'}">`;
}
async function loadProducts(){
  const catalogue=window.NADIA_PRODUCTS||[];
  let rows=null;
  if(sb){
    try{
      const {data,error}=await sb.from('products').select('*').eq('active',true).order('created_at');
      if(!error&&Array.isArray(data)){
        const defaults=new Map(catalogue.map(p=>[p.slug,p]));
        rows=data.map(p=>({...defaults.get(p.slug),...p}));
      }
    }catch(error){console.warn('Product catalogue unavailable')}
  }
  // A successful empty result means the admin intentionally hid all products.
  // Offline catalogue entries are read-only and must never become purchasable.
  allProducts=rows===null?catalogue.map(p=>({...p,price:null,stock:0})):rows;
  productsLoaded=true;
  if(rows!==null){const cleaned=NadiaStore.reconcile(cart,allProducts);if(JSON.stringify(cleaned)!==JSON.stringify(cart)){cart=cleaned;saveCart();toast(t('تم تحديث السلة حسب التوفر الحالي.','Your bag was updated to match current availability.'));}}
  renderProducts();renderCart();renderProductPage();renderCheckout();updateWhatsApp();
}

function filteredProducts(){let rows=[...allProducts];const q=($('#searchProducts')?.value||'').trim().toLowerCase();const filter=$('#productFilter')?.value||'all';if(q)rows=rows.filter(p=>[p.name_ar,p.name_en,p.description_ar,p.description_en,p.slug].some(v=>String(v||'').toLowerCase().includes(q)));if(filter==='available')rows=rows.filter(p=>NadiaStore.purchasable(p));if(filter==='wishlist')rows=rows.filter(p=>wishlist.includes(p.slug));return rows}
function renderProducts(){const el=$('#productGrid');if(!el)return;const rows=filteredProducts();el.innerHTML=rows.length?rows.map(p=>{const img=productImage(p);const out=!NadiaStore.purchasable(p);return `<article class="card"><button class="wish ${wishlist.includes(p.slug)?'active':''}" onclick="toggleWish('${safe(p.slug)}')" aria-label="${t('المفضلة','Wishlist')}" aria-pressed="${wishlist.includes(p.slug)}">♥</button><a href="product.html?slug=${encodeURIComponent(p.slug)}"><div class="product-media">${img?`${productImgTag(p)}<span class="product-image-name">${safe(pname(p))}</span>`:safe(pname(p).slice(0,1))}</div><h3>${safe(pname(p))}</h3></a><div class="meta">${money(p.price)}</div><div class="stock ${out?'out':''}">${out?t('غير متوفر حالياً','Currently unavailable'):t('متوفر حسب المخزون','Availability subject to stock')}</div><div class="row"><button class="btn gold" ${out?'disabled':''} onclick="addToCart('${safe(p.slug)}')">${t('أضف للسلة','Add to cart')}</button><a class="btn soft" href="product.html?slug=${encodeURIComponent(p.slug)}">${t('التفاصيل','Details')}</a><a class="btn soft product-inquiry" href="${safe(whatsappUrl(p))}" target="_blank" rel="noopener">${t('استفسر عبر واتساب','Ask on WhatsApp')}</a></div></article>`}).join(''):`<div class="panel">${t('لا توجد نتائج','No products found')}</div>`}
function toggleWish(slug){wishlist=wishlist.includes(slug)?wishlist.filter(x=>x!==slug):[...wishlist,slug];NadiaStore.write('nadia_wishlist',wishlist);renderProducts();renderWishlistCount()}
function renderWishlistCount(){$$('[data-wish-count]').forEach(x=>x.textContent=wishlist.length)}
function addToCart(slug,qty=1){const p=allProducts.find(x=>x.slug===slug);if(!p)return toast(t('المنتج غير موجود','Product not found'));if(!NadiaStore.purchasable(p))return toast(t('المنتج غير متوفر','Product unavailable'));const requested=Math.min(100,Math.max(1,Math.floor(Number(qty)||1)));const f=cart.find(x=>x.slug===slug);const current=f?.qty||0;const max=Math.min(100,Math.max(0,Number(p.stock)||0));const next=Math.min(current+requested,max);if(next<=current)return toast(t('لا توجد كمية إضافية متاحة','No additional stock available'));if(f)f.qty=next;else cart.push({slug,qty:next});saveCart();openCart();toast(t('تمت الإضافة للسلة','Added to bag'))}
function changeQty(slug,d){const x=cart.find(i=>i.slug===slug);if(!x)return;const p=allProducts.find(i=>i.slug===slug);const max=Math.min(100,Math.max(1,Number(p?.stock)||1));x.qty=Math.min(max,Math.max(1,x.qty+d));saveCart()}
function removeItem(slug){cart=cart.filter(x=>x.slug!==slug);saveCart()}
function saveCart(){NadiaStore.write('nadia_cart',cart);renderCart();renderCheckout()}
function cartTotal(){return cart.reduce((sum,i)=>{const p=allProducts.find(x=>x.slug===i.slug);return sum+(p?.price!=null?Number(p.price)*i.qty:0)},0)}
function renderCart(){$$('[data-cart-count]').forEach(x=>x.textContent=cart.reduce((a,b)=>a+b.qty,0));const el=$('#cartItems');if(!el)return;el.innerHTML=cart.length?cart.map(i=>{const p=allProducts.find(x=>x.slug===i.slug)||{slug:i.slug,name_ar:i.slug,name_en:i.slug};const img=productImage(p);return `<div class="cart-item">${img?productImgTag(p,'cart-thumb'):`<div class="cart-thumb"></div>`}<div><b>${safe(pname(p))}</b><br><small>${money(p.price)}</small><div class="row"><button aria-label="${t('تغيير الكمية','Change quantity')}" onclick="changeQty('${safe(i.slug)}',-1)">−</button><span>${i.qty}</span><button aria-label="${t('تغيير الكمية','Change quantity')}" onclick="changeQty('${safe(i.slug)}',1)">+</button></div></div><button aria-label="${t('إزالة المنتج','Remove item')}" onclick="removeItem('${safe(i.slug)}')">×</button></div>`}).join('')+`<div class="cart-total"><span>${t('الإجمالي','Total')}</span><span>${money(cartTotal())}</span></div>`:t('السلة فارغة','Your bag is empty')}
function ensureBackdrop(){let el=$('#uiBackdrop');if(!el){el=document.createElement('button');el.id='uiBackdrop';el.className='ui-backdrop hidden';el.type='button';el.setAttribute('aria-label',t('إغلاق','Close'));el.addEventListener('click',closePanels);document.body.append(el)}return el}
function setPanelState(panel,open,triggerSelector){if(!panel)return;panel.classList.toggle('hidden',!open);$$(triggerSelector).forEach(btn=>btn.setAttribute('aria-expanded',String(open)))}
function syncPanelUi(){const open=!$('#cartDrawer')?.classList.contains('hidden')||!$('#mobileMenu')?.classList.contains('hidden');ensureBackdrop().classList.toggle('hidden',!open);document.body.classList.toggle('ui-locked',open)}
function openCart(){closeMenu();setPanelState($('#cartDrawer'),true,'[onclick="openCart()"]');syncPanelUi();$('#cartDrawer button')?.focus()}
function closeCart(){setPanelState($('#cartDrawer'),false,'[onclick="openCart()"]');syncPanelUi()}
function openMenu(){closeCart();setPanelState($('#mobileMenu'),true,'[onclick="openMenu()"]');syncPanelUi();$('#mobileMenu button')?.focus()}
function closeMenu(){setPanelState($('#mobileMenu'),false,'[onclick="openMenu()"]');syncPanelUi()}
function closePanels(){setPanelState($('#cartDrawer'),false,'[onclick="openCart()"]');setPanelState($('#mobileMenu'),false,'[onclick="openMenu()"]');syncPanelUi()}
document.addEventListener('keydown',event=>{if(event.key==='Escape')closePanels()});
async function loadHomeContent(){
  if(!sb||!document.querySelector('.hero'))return;
  const {data}=await sb.from('site_content').select('value').eq('key','home').maybeSingle();
  const v=data?.value||{};
  const setText=(el,ar,en)=>{if(!el)return;if(ar!==undefined)el.dataset.ar=ar;if(en!==undefined)el.dataset.en=en;el.textContent=lang==='ar'?(el.dataset.ar||''):(el.dataset.en||'')};
  const setImg=applyCmsImage;
  setText(document.querySelector('.hero h1'),v.hero_ar,v.hero_en);
  setImg(document.querySelector('.hero .campaign-image'),v.hero_image);
  setText(document.querySelector('#gifting h2'),v.gifts_ar,v.gifts_en);
  setImg(document.querySelector('#gifting .campaign-image'),v.gifts_image);
  setText(document.querySelector('#events h2'),v.event_ar,v.event_en);
  const eventImgs=document.querySelectorAll('#events .home-event-gallery img');
  setImg(eventImgs[0],v.event_image_1);setImg(eventImgs[1],v.event_image_2);
  setText(document.querySelector('#our-story h2'),v.story_ar,v.story_en);
  setImg(document.querySelector('#our-story .campaign-image'),v.story_image);
}
async function loadAnnouncement(){if(!sb)return;const {data}=await sb.from('announcements').select('*').eq('active',true).order('updated_at',{ascending:false}).limit(1).maybeSingle();const el=$('#announcement');if(el&&data){el.dataset.ar=data.text_ar||'';el.dataset.en=data.text_en||'';el.textContent=lang==='ar'?data.text_ar:data.text_en;el.classList.remove('hidden')}}
function renderProductPage(){const el=$('#productDetail');if(!el)return;if(!productsLoaded){el.textContent=t('جاري التحميل…','Loading…');return;}const slug=new URLSearchParams(location.search).get('slug');const p=allProducts.find(x=>x.slug===slug);if(!p){el.innerHTML=`<div class="panel">${t('العطر غير موجود','Perfume not found')}</div>`;return}updateProductMetadata(p);const previousQty=$('#detailQty')?.value||'1';const img=productImage(p),desc=lang==='ar'?(p.description_ar||''):(p.description_en||'');const size=p.size||p.size_ml||'';el.innerHTML=`<div class="product-media">${img?`${productImgTag(p)}<span class="product-image-name product-image-name--detail">${safe(pname(p))}</span>`:safe(pname(p).slice(0,1))}</div><div><div class="eyebrow">${t('عطور نادية','NADIA’S PERFUME CART')}</div><h2>${safe(pname(p))}</h2><div class="price">${money(p.price)}</div>${size?`<div class="chips"><span class="chip">${safe(size)}${String(size).match(/^\d+$/)?t(' مل',' ml'):''}</span></div>`:''}<p>${desc?safe(desc):t('تواصل معنا لمعرفة تفاصيل هذا العطر.','Contact us for details about this perfume.')}</p><div class="row"><input id="detailQty" aria-label="${t('الكمية','Quantity')}" class="qty" type="number" min="1" value="${safe(previousQty)}"><button class="btn gold" ${NadiaStore.purchasable(p)?'':'disabled'} onclick="addToCart('${safe(p.slug)}',document.getElementById('detailQty').value)">${t('أضف للسلة','Add to cart')}</button><button class="btn soft" onclick="toggleWish('${safe(p.slug)}')">♥ ${t('المفضلة','Wishlist')}</button></div></div>`}
function checkoutSettings(){return window.NADIA_CMS_SETTINGS||{};}
function activeShippingRates(){const settings=checkoutSettings();return (settings.shipping_rates||[]).filter(r=>r.country==='EG'||settings.international_shipping_enabled===true);}
function deliveryCountryName(code){try{return new Intl.DisplayNames([lang==='ar'?'ar':'en'],{type:'region'}).of(code)||code;}catch{return code;}}
function selectedShipping(){const country=$('#checkoutCountry')?.value;return activeShippingRates().find(r=>r.country===country);}
function renderCheckout(){
 const el=$('#orderSummary');if(!el)return;
 const settings=checkoutSettings(),select=$('#checkoutCountry');
 if(select){const previous=select.value;select.innerHTML=activeShippingRates().map(r=>`<option value="${safe(r.country)}">${safe(deliveryCountryName(r.country))}</option>`).join('');if([...select.options].some(o=>o.value===previous))select.value=previous;}
 const rate=selectedShipping(),enabled=settings.checkout_enabled===true&&settings.policies_ready===true&&rate&&cart.length&&productsLoaded;
 const btn=$('#checkoutForm [type=submit]');if(btn&&!btn.dataset.sending)btn.disabled=!enabled;
 const notice=$('#checkoutNotice');if(notice)notice.textContent=settings.checkout_enabled===true?'':t('الطلب عبر الموقع غير متاح حاليًا. للاستفسار تواصل معنا عبر واتساب.','Online ordering is currently unavailable. Please enquire on WhatsApp.');
 const payment=$('#paymentDescription');if(payment)payment.textContent=settings.payment_method==='cod'?t('الدفع عند الاستلام','Cash on delivery'):t('نتواصل معك لتنسيق الدفع قبل تجهيز الطلب. لا يتم تحصيل مبلغ إلكتروني هنا.','We will contact you to arrange payment before preparing the order. No online charge is taken here.');
 el.innerHTML=cart.length?cart.map(i=>{const p=allProducts.find(x=>x.slug===i.slug)||{name_ar:i.slug,name_en:i.slug};return `<div class="summary-line"><span>${safe(pname(p))} × ${i.qty}</span><span>${p.price!=null?money(Number(p.price)*i.qty):'—'}</span></div>`}).join('')+`<div class="summary-line"><span>${t('الشحن','Shipping')}</span><span>${rate?money(Number(rate.fee)):'—'}</span></div><div class="cart-total"><span>${t('الإجمالي','Total')}</span><span>${rate?money(cartTotal()+Number(rate.fee)):'—'}</span></div>`:t('السلة فارغة','Your bag is empty');
}
async function submitOrder(e){
 e.preventDefault();const form=e.target,btn=form.querySelector('[type=submit]');if(btn.dataset.sending)return;
 if(!cart.length||!sb||!selectedShipping()||!checkoutSettings().checkout_enabled)return toast(t('راجع السلة وتوفر التوصيل أولًا.','Check your bag and delivery availability first.'));
 if(cart.some(i=>!NadiaStore.purchasable(allProducts.find(p=>p.slug===i.slug)))){await loadProducts();return;}
 const f=new FormData(form),rate=selectedShipping(),settings=checkoutSettings();
 const payload=Object.fromEntries(['customer_name','phone','email','governorate','city','address','notes','gift_message','website'].map(k=>[k,String(f.get(k)||'').trim()]));
 Object.assign(payload,{language:lang,country:rate.country,shipping_cost:Number(rate.fee),currency:settings.currency,payment_method:settings.payment_method,terms_accepted:f.get('terms_accepted')==='on',items:cart.map(i=>({product_id:allProducts.find(p=>p.slug===i.slug).id,quantity:i.qty,unit_price:Number(allProducts.find(p=>p.slug===i.slug).price)}))});
 btn.dataset.sending='1';btn.disabled=true;btn.textContent=t('جاري إرسال الطلب…','Submitting…');
 try{
   payload.request_id=await NadiaStore.requestId('order',payload);
   const {data,error}=await sb.rpc('create_store_order',{payload});if(error)throw error;
   cart=[];saveCart();NadiaStore.remove('nadia_pending_order');form.reset();
   $('#checkoutSuccess').innerHTML=`<div class="success" role="status">${t('تم استلام طلبك. رقم الطلب: ','Order received. Reference: ')}<b>${safe(data.order_number)}</b><p>${money(data.total,data.currency)}</p></div>`;
   await loadProducts();window.scrollTo({top:0,behavior:'smooth'});
 }catch(error){toast(NadiaStore.error(error,lang==='ar'));if(/STOCK|UNAVAILABLE|CHANGED/.test(error.message||''))await Promise.allSettled([loadProducts(),loadCmsRuntime()]);}
 finally{delete btn.dataset.sending;btn.textContent=t('تأكيد الطلب','Place order');renderCheckout();}
}
document.addEventListener('DOMContentLoaded',()=>{ensureBackdrop();$$('[onclick="openMenu()"]').forEach(btn=>{btn.setAttribute('aria-controls','mobileMenu');btn.setAttribute('aria-expanded','false')});$$('[onclick="openCart()"]').forEach(btn=>{btn.setAttribute('aria-controls','cartDrawer');btn.setAttribute('aria-expanded','false')});$$('#mobileMenu a').forEach(link=>link.addEventListener('click',closeMenu));if(new URLSearchParams(location.search).get('view')==='wishlist'&&$('#productFilter'))$('#productFilter').value='wishlist';applyLang();Promise.allSettled([loadProducts(),loadAnnouncement(),loadHomeContent()]);$('#searchProducts')?.addEventListener('input',renderProducts);$('#productFilter')?.addEventListener('change',renderProducts);$('#checkoutForm')?.addEventListener('submit',submitOrder)});

async function submitEventRequest(e){
 e.preventDefault();if(!sb)return toast(t('تعذر الاتصال. حاول مجددًا.','Connection unavailable. Please retry.'));
 const form=e.target,btn=form.querySelector('[type=submit]');if(btn.dataset.sending)return;
 const f=new FormData(form),payload=Object.fromEntries(['customer_name','phone','email','event_type','event_date','event_time','city','venue','guest_count','requirements','notes','website'].map(k=>[k,String(f.get(k)||'').trim()]));
 Object.assign(payload,{language:lang,contact_consent:f.get('contact_consent')==='on'});
 btn.dataset.sending='1';btn.disabled=true;btn.textContent=t('جاري الإرسال…','Sending…');
 try{payload.request_id=await NadiaStore.requestId('event',payload);const {data,error}=await sb.rpc('create_event_request',{payload});if(error)throw error;
 form.reset();NadiaStore.remove('nadia_pending_event');$('#eventSuccess').innerHTML=`<div class="success" role="status">${t('تم استلام طلبك. المرجع: ','Request received. Reference: ')}<b>${safe(data.request_number)}</b></div>`;
 }catch(error){toast(NadiaStore.error(error,lang==='ar'));}
 finally{delete btn.dataset.sending;btn.disabled=false;btn.textContent=t('إرسال طلب التنسيق','Send coordination request');}
}
document.addEventListener('DOMContentLoaded',()=>{document.getElementById('eventForm')?.addEventListener('submit',submitEventRequest)});

function rememberViewed(slug){
  if(!slug)return;
  let v=readStoredList('nadia_recent').filter(x=>x!==slug);
  v.unshift(slug); NadiaStore.write('nadia_recent',v.slice(0,6));
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
  const phone=String(window.NADIA_CMS_SETTINGS?.whatsapp||'201112564000').replace(/[^0-9]/g,'');
  return 'https://wa.me/'+phone+'?text='+encodeURIComponent(message);
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

// ---------- CMS runtime: settings + editable page content ----------
let nadiaCmsCache=null;
function cmsPageKey(){
  const file=(location.pathname.split('/').pop()||'index.html').split('?')[0];
  const map={'story.html':'story','gifts.html':'gifts','shipping.html':'shipping','faq.html':'faq','privacy.html':'privacy','terms.html':'terms','returns.html':'returns','event-cart.html':'event_cart'};
  return map[file]||null;
}
function applyCmsText(el,ar,en){
  if(!el)return;
  if(ar!==undefined)el.dataset.ar=ar;if(en!==undefined)el.dataset.en=en;
  el.textContent=lang==='ar'?(el.dataset.ar??el.textContent):(el.dataset.en??el.textContent);
}
function applyCmsImage(el,url){
  if(!el||url===undefined)return;
  if(url===''){el.hidden=true;return;}
  if(NadiaStore.imageUrl(url)){el.hidden=false;el.src=url;el.removeAttribute('srcset');}
}
function applyGlobalSettings(settings={}){
  window.NADIA_CMS_SETTINGS={currency:'EGP',whatsapp:'201112564000',...settings};
  const s=window.NADIA_CMS_SETTINGS;
  const phone=String(s.whatsapp||'201112564000').replace(/[^0-9]/g,'');
  document.querySelectorAll('.whatsapp-contact').forEach(a=>{
    a.href='https://wa.me/'+phone;
    const b=a.querySelector('bdi');if(b)b.textContent='+'+phone;
  });
  if(NadiaStore.httpsUrl(s.instagram))document.querySelectorAll('a[href*="instagram.com"]').forEach(a=>a.href=s.instagram);
  if(NadiaStore.httpsUrl(s.tiktok))document.querySelectorAll('a[href*="tiktok.com"]').forEach(a=>a.href=s.tiktok);
  document.querySelectorAll('footer .muted').forEach(el=>applyCmsText(el,s.footer_ar,s.footer_en));
  updateWhatsApp();
  renderProducts();renderCart();renderProductPage();renderCheckout();
}
function applyPageCms(page,v={}){
  if(!page||!v)return;
  let title=null,body=null,image=null;
  if(page==='story'){title=document.querySelector('main .panel h2');body=document.querySelector('main .panel p');image=document.querySelector('main .campaign-figure img')}
  else if(page==='gifts'){title=document.querySelector('main .panel h2');body=document.querySelector('main .panel p');image=document.querySelector('main .campaign-figure img')}
  else if(page==='shipping'){title=document.querySelector('main .panel h2');body=document.querySelector('main .panel p')}
  else if(page==='faq'){title=document.querySelector('main .section-head h2');body=document.querySelector('main .section-head .cms-page-intro');if(!body&&(v.body_ar||v.body_en)){const head=document.querySelector('main .section-head');if(head){body=document.createElement('p');body.className='cms-page-intro muted';head.appendChild(body)}}}
  else if(['privacy','terms','returns'].includes(page)){title=document.querySelector('main .panel h2');body=document.querySelector('main .panel p')}
  else if(page==='event_cart'){title=document.querySelector('.event-copy h1');body=document.querySelector('.event-copy .event-lead');image=document.querySelector('.event-photo-showcase img')}
  applyCmsText(title,v.title_ar,v.title_en);
  applyCmsText(body,v.body_ar,v.body_en);
  applyCmsImage(image,v.image_url);
  if(page==='event_cart'&&v.gallery_managed&&Array.isArray(v.gallery)){
    const host=document.querySelector('.event-photo-showcase');
    if(host){const urls=[v.image_url,...v.gallery].filter((u,i,a)=>NadiaStore.imageUrl(u)&&a.indexOf(u)===i);host.innerHTML=urls.map((url,i)=>`<img class="event-photo ${i===0?'event-photo-main':''}" src="${safe(url)}" alt="${t('عربة نادية للمناسبات','Nadia’s Event Cart')}" loading="${i?'lazy':'eager'}" decoding="async">`).join('');}
  }
  if(Array.isArray(v.blocks)) for(const block of v.blocks){
    const target=document.querySelector(`[data-cms-block="${CSS.escape(block.id)}"]`);
    applyCmsText(target,block.ar,block.en);
  }

}
async function loadCmsRuntime(){
  if(!sb)return;
  const {data,error}=await sb.from('site_content').select('key,value');
  if(error)return;
  nadiaCmsCache={};(data||[]).forEach(r=>nadiaCmsCache[r.key]=r.value||{});
  applyGlobalSettings(nadiaCmsCache.settings||{});
  const page=cmsPageKey();if(page)applyPageCms(page,nadiaCmsCache['page_'+page]||{});
  if(document.querySelector('.hero'))await loadHomeContent();
}
document.addEventListener('DOMContentLoaded',()=>loadCmsRuntime().catch(()=>{}));
document.addEventListener('languagechange',()=>{
  if(!nadiaCmsCache)return;
  applyGlobalSettings(nadiaCmsCache.settings||{});
  const page=cmsPageKey();if(page)applyPageCms(page,nadiaCmsCache['page_'+page]||{});
  if(document.querySelector('.hero'))loadHomeContent();
});




// Focus containment and restoration for mobile navigation and shopping bag.
let panelTrigger=null;
document.addEventListener('click',e=>{if(e.target.closest('[onclick="openCart()"],[onclick="openMenu()"]'))panelTrigger=e.target.closest('button');});
document.addEventListener('keydown',e=>{
 const panel=['#cartDrawer','#mobileMenu'].map(s=>$(s)).find(p=>p&&!p.classList.contains('hidden'));
 if(e.key==='Escape'&&panelTrigger)panelTrigger.focus();
 if(e.key==='Tab'&&panel){const nodes=[...panel.querySelectorAll('a[href],button,input,select,textarea,[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length);if(!nodes.length)return;
 const first=nodes[0],last=nodes[nodes.length-1];if(e.shiftKey&&(document.activeElement===first||!panel.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||!panel.contains(document.activeElement))){e.preventDefault();first.focus();}}
});
document.addEventListener('DOMContentLoaded',()=>{
 $('#checkoutCountry')?.addEventListener('change',renderCheckout);
 const date=$('[name="event_date"]');if(date){const now=new Date();now.setMinutes(now.getMinutes()-now.getTimezoneOffset());date.min=now.toISOString().slice(0,10);}
 document.querySelectorAll('#mobileMenu,#cartDrawer').forEach(el=>{el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label',el.id==='mobileMenu'?t('القائمة','Menu'):t('السلة','Bag'));});
});

function updateProductMetadata(p){
 const title=pname(p)+' | '+t('عطور نادية','Nadia’s Perfume Cart');document.title=title;
 const url=new URL('product.html',location.href);url.searchParams.set('slug',p.slug);
 document.querySelector('link[rel=canonical]')?.setAttribute('href',url.href);
 document.querySelectorAll('link[hreflang]').forEach(el=>{const alternate=new URL(url);if(el.hreflang!=='x-default')alternate.searchParams.set('lang',el.hreflang);el.href=alternate.href;});
 document.querySelector('meta[property="og:title"]')?.setAttribute('content',title);
 const description=(lang==='ar'?p.description_ar:p.description_en)||title;
 document.querySelectorAll('meta[name="description"],meta[property="og:description"]').forEach(el=>el.setAttribute('content',description));
 let schema=document.getElementById('productSchema');if(!schema){schema=document.createElement('script');schema.id='productSchema';schema.type='application/ld+json';document.head.append(schema);}
 const data={'@context':'https://schema.org','@type':'Product',name:pname(p),description,sku:p.slug,image:new URL(productImage(p),location.href).href,brand:{'@type':'Brand',name:'Nadia’s Perfume Cart'}};
 if(Number(p.price)>0)data.offers={'@type':'Offer',url:url.href,price:Number(p.price),priceCurrency:checkoutSettings().currency||'EGP',availability:checkoutSettings().checkout_enabled&&NadiaStore.purchasable(p)?'https://schema.org/InStock':'https://schema.org/OutOfStock'};
 schema.textContent=JSON.stringify(data);
}
