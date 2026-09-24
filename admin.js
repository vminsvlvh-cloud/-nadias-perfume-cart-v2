const cfg=window.NADIA_SUPABASE||{};
const sb=supabase.createClient(cfg.url,cfg.anonKey);
const MEDIA_BUCKET='site-media';
let products=[],orders=[],events=[],siteSettings={currency:'EGP'},currentUser=null;
let pageLoadVersion=0;

const A=s=>document.querySelector(s);
const AA=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const txt=(ar,en)=>typeof t==='function'?t(ar,en):(document.documentElement.lang==='ar'?ar:en);
const setStatus=(id,message,type='')=>{const el=A(id);if(!el)return;el.textContent=message||'';el.className='status-line'+(type?' '+type:'')};
const val=id=>A(id)?.value?.trim()||'';
const setVal=(id,value='')=>{const el=A(id);if(el)el.value=value??''};
const checked=id=>!!A(id)?.checked;

async function init(){
  const {data:{session}}=await sb.auth.getSession();
  if(!session)return showLogin();
  const {data:isAdmin,error}=await sb.rpc('is_admin');
  if(error||!isAdmin){
    await sb.auth.signOut();
    showLogin(txt('هذا الحساب لا يملك صلاحية الإدارة.','This account does not have admin access.'));
    return;
  }
  currentUser=session.user;
  showApp();
  await refreshAll();
}
function showLogin(message=''){A('#login')?.classList.remove('hidden');A('#app')?.classList.add('hidden');if(message)setStatus('#loginMsg',message,'error')}
async function login(e){
  e.preventDefault();setStatus('#loginMsg',txt('جاري تسجيل الدخول…','Signing in…'));
  const f=new FormData(e.target);
  const {data,error}=await sb.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});
  if(error)return setStatus('#loginMsg',error.message,'error');
  const {data:isAdmin,error:roleError}=await sb.rpc('is_admin');
  if(roleError||!isAdmin){
    await sb.auth.signOut();
    return setStatus('#loginMsg',txt('هذا الحساب لا يملك صلاحية الإدارة.','This account does not have admin access.'),'error');
  }
  currentUser=data.user;showApp();await refreshAll();
}
async function logout(){await sb.auth.signOut();location.reload()}
function showApp(){
  A('#login')?.classList.add('hidden');A('#app')?.classList.remove('hidden');
  if(A('#adminUser'))A('#adminUser').textContent=currentUser?.email||'Admin';
}
const TAB_TEXT={
  dashboard:['نظرة عامة','Dashboard','إدارة الموقع من لوحة واحدة.','Manage your website from one dashboard.'],
  products:['المنتجات','Products','الاسم والسعر والمخزون والصور والتوفر.','Names, prices, stock, images and availability.'],
  home:['الصفحة الرئيسية','Home page','تحكم في صور وعناوين الصفحة الرئيسية.','Control home page images and titles.'],
  pages:['الصفحات','Pages','عدّل محتوى الصفحات الأساسية وعربة المناسبات.','Edit core page content and Event Cart.'],
  settings:['إعدادات الموقع','Site settings','بيانات التواصل والإعلان والإعدادات العامة.','Contact details, announcement and general settings.'],
  orders:['الطلبات','Orders','تابع الطلبات وحدّث حالتها.','Review orders and update their status.'],
  events:['طلبات المناسبات','Event requests','تابع حجوزات عربة المناسبات.','Manage event cart booking requests.']
};
function openTab(name,button,options={}){
  AA('.admin-tab').forEach(el=>el.classList.toggle('active',el.id==='tab-'+name));
  AA('[data-admin-tab]').forEach(el=>el.classList.toggle('active',el.dataset.adminTab===name));
  const x=TAB_TEXT[name]||TAB_TEXT.dashboard;
  const title=A('#tabTitle'),sub=A('#tabSubtitle');
  if(title){title.dataset.ar=x[0];title.dataset.en=x[1];title.textContent=txt(x[0],x[1])}
  if(sub){sub.dataset.ar=x[2];sub.dataset.en=x[3];sub.textContent=txt(x[2],x[3])}
  if(name==='pages'&&!options.skipLoad)loadPageContent();
  window.scrollTo({top:0,behavior:'smooth'});
}
async function refreshAll(){
  await Promise.all([loadProducts(),loadOrders(),loadEvents(),loadAnnouncement(),loadHomeContent(),loadSettings()]);
  updateMetrics();
}
function updateMetrics(){
  if(A('#metricProducts'))A('#metricProducts').textContent=products.length;
  if(A('#metricAvailable'))A('#metricAvailable').textContent=products.filter(p=>p.active&&Number(p.stock)>0).length;
  if(A('#metricOrders'))A('#metricOrders').textContent=orders.length;
  if(A('#metricEvents'))A('#metricEvents').textContent=events.length;
}
function adminMoney(value){
  if(value==null||value==='')return '—';
  try{return new Intl.NumberFormat(lang==='ar'?'ar-EG':'en-GB',{style:'currency',currency:siteSettings.currency||'EGP',maximumFractionDigits:2}).format(Number(value||0))}
  catch(_){return Number(value||0).toFixed(2)+' '+(siteSettings.currency||'EGP')}
}
const adminDate=value=>value?new Date(value).toLocaleString(lang==='ar'?'ar-EG':'en-GB'):'—';

async function loadProducts(){
  const {data,error}=await sb.from('products').select('*').order('created_at');
  if(error){console.error(error);return}
  products=data||[];renderProducts();updateMetrics();
}
function renderProducts(){
  const body=A('#productsBody');if(!body)return;
  const q=(A('#productSearch')?.value||'').trim().toLowerCase();
  const rows=products.filter(p=>!q||[p.name_ar,p.name_en,p.slug].some(v=>String(v||'').toLowerCase().includes(q)));
  body.innerHTML=rows.map(p=>{
    const available=p.active&&Number(p.stock)>0;
    const image=p.image_url||'assets/products/nadias-product-bottle.webp';
    return `<tr>
      <td><img src="${esc(image)}" alt="" loading="lazy" onerror="this.src='assets/products/nadias-product-bottle.webp'"></td>
      <td><b>${esc(p.name_ar)}</b><br><small>${esc(p.name_en)}</small><br><small>${esc(p.slug)}</small></td>
      <td>${adminMoney(p.price)}</td><td>${p.stock??'—'}</td>
      <td><span class="admin-pill ${available?'on':'off'}">${available?txt('متوفر','Available'):txt('غير متوفر','Unavailable')}</span></td>
      <td><div class="admin-actions"><button class="admin-btn small" onclick="editProduct('${p.id}')">${txt('تعديل','Edit')}</button><button class="admin-btn small" onclick="toggleAvailability('${p.id}',${available?'false':'true'})">${available?txt('إخفاء','Hide'):txt('إظهار','Show')}</button></div></td>
    </tr>`;
  }).join('')||`<tr><td colspan="6">${txt('لا توجد منتجات.','No products found.')}</td></tr>`;
}
function newProduct(){
  A('#productForm')?.reset();setVal('#pid','');if(A('[name="active"]'))A('[name="active"]').checked=true;
  setStatus('#productStatus','');A('#productImagePreview')?.classList.remove('show');A('#productEditor')?.classList.remove('hidden');
}
function closeProductEditor(){A('#productEditor')?.classList.add('hidden');setStatus('#productStatus','')}
function editProduct(id){
  const p=products.find(x=>x.id===id);if(!p)return;
  const fields=['id','slug','name_ar','name_en','price','compare_at_price','size_ml','stock','image_url','description_ar','description_en'];
  fields.forEach(k=>{const el=A(`[name="${k}"]`);if(el)el.value=p[k]??''});
  A('[name="active"]').checked=!!p.active;A('[name="featured"]').checked=!!p.featured;
  A('#productEditor')?.classList.remove('hidden');previewProductImage();
}
function previewProductImage(){
  const url=val('#productImageUrl'),img=A('#productImagePreview');if(!img)return;
  if(url){img.src=url;img.classList.add('show')}else img.classList.remove('show');
}
function previewLocalProductImage(input){
  const file=input.files?.[0],img=A('#productImagePreview');if(!file||!img)return;
  img.src=URL.createObjectURL(file);img.classList.add('show');
}
async function uploadImage(file,folder='general'){
  if(!file)return null;
  const allowed=['image/jpeg','image/png','image/webp'];
  if(!allowed.includes(file.type))throw new Error(txt('الصورة يجب أن تكون JPG أو PNG أو WEBP.','Image must be JPG, PNG or WEBP.'));
  if(file.size>8*1024*1024)throw new Error(txt('حجم الصورة يجب ألا يتجاوز 8MB.','Image must be 8MB or smaller.'));
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'');
  const id=(crypto.randomUUID?.()||Math.random().toString(36).slice(2));
  const path=`${folder}/${Date.now()}-${id}.${ext}`;
  const {error}=await sb.storage.from(MEDIA_BUCKET).upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
  if(error)throw error;
  const {data}=sb.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
async function toggleAvailability(id,makeAvailable){
  const p=products.find(x=>x.id===id);if(!p)return;
  if(makeAvailable&&!(Number(p.stock)>0)){editProduct(id);A('[name="stock"]')?.focus();return alert(txt('أدخل كمية المخزون أولاً.','Enter stock quantity first.'))}
  const {error}=await sb.from('products').update({active:makeAvailable,updated_at:new Date().toISOString()}).eq('id',id);
  if(error)return alert(error.message);await loadProducts();
}
async function saveProduct(e){
  e.preventDefault();
  const form=e.target;
  if(form.dataset.saving==='true')return;
  form.dataset.saving='true';
  const submit=form.querySelector('[type="submit"]');if(submit)submit.disabled=true;
  setStatus('#productStatus',txt('جاري الحفظ…','Saving…'));
  try{
    const f=new FormData(form),id=String(f.get('id')||''),slug=String(f.get('slug')||'').trim().toLowerCase();
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))throw new Error(txt('معرّف الرابط يجب أن يحتوي على حروف إنجليزية صغيرة وأرقام وشرطات فقط.','Slug can only contain lowercase letters, numbers and hyphens.'));
    if(products.some(p=>p.slug===slug&&String(p.id)!==id))throw new Error(txt('معرّف الرابط مستخدم لمنتج آخر.','This slug is already used by another product.'));
    let imageUrl=String(f.get('image_url')||'').trim()||null;
    const file=A('#productImageFile')?.files?.[0];if(file)imageUrl=await uploadImage(file,'products');
    const row={
      slug,name_ar:String(f.get('name_ar')||'').trim(),name_en:String(f.get('name_en')||'').trim(),
      price:f.get('price')===''?null:Number(f.get('price')),compare_at_price:f.get('compare_at_price')===''?null:Number(f.get('compare_at_price')),
      size_ml:f.get('size_ml')===''?null:Number(f.get('size_ml')),stock:f.get('stock')===''?0:Number(f.get('stock')),
      image_url:imageUrl,description_ar:String(f.get('description_ar')||'').trim()||null,description_en:String(f.get('description_en')||'').trim()||null,
      active:f.get('active')==='on',featured:f.get('featured')==='on',updated_at:new Date().toISOString()
    };
    const r=id
      ?await sb.from('products').update(row).eq('id',id).select('id,slug').single()
      :await sb.from('products').insert(row).select('id,slug').single();
    if(r.error)throw r.error;
    if(A('#productImageFile'))A('#productImageFile').value='';
    setVal('#productImageUrl',imageUrl||'');
    setStatus('#productStatus',txt('تم الحفظ.','Saved.'),'success');
    await loadProducts();setTimeout(closeProductEditor,500);
  }catch(err){
    console.error(err);setStatus('#productStatus',err.message||String(err),'error');
  }finally{
    delete form.dataset.saving;if(submit)submit.disabled=false;
  }
}

async function getContent(key){
  const {data,error}=await sb.from('site_content').select('value').eq('key',key).maybeSingle();
  if(error&&!/does not exist|schema cache/i.test(error.message))throw error;
  return data?.value||{};
}
async function putContent(key,value){
  const {error}=await sb.from('site_content').upsert({key,value,updated_at:new Date().toISOString()},{onConflict:'key'});
  if(error)throw error;
}
async function maybeUpload(fileId,folder,current=''){
  const file=A(fileId)?.files?.[0];return file?await uploadImage(file,folder):current;
}
async function loadHomeContent(){
  try{
    const v=await getContent('home');
    setVal('#homeHeroAr',v.hero_ar);setVal('#homeHeroEn',v.hero_en);setVal('#homeHeroImage',v.hero_image);
    setVal('#homeGiftsAr',v.gifts_ar);setVal('#homeGiftsEn',v.gifts_en);setVal('#homeGiftsImage',v.gifts_image);
    setVal('#homeEventAr',v.event_ar);setVal('#homeEventEn',v.event_en);setVal('#homeEventImage1',v.event_image_1);setVal('#homeEventImage2',v.event_image_2);
    setVal('#homeStoryAr',v.story_ar);setVal('#homeStoryEn',v.story_en);setVal('#homeStoryImage',v.story_image);
  }catch(err){console.error(err)}
}
async function saveHomeContent(e){
  e.preventDefault();setStatus('#homeStatus',txt('جاري الحفظ…','Saving…'));
  try{
    const value={
      hero_ar:val('#homeHeroAr'),hero_en:val('#homeHeroEn'),hero_image:await maybeUpload('#homeHeroFile','home/hero',val('#homeHeroImage')),
      gifts_ar:val('#homeGiftsAr'),gifts_en:val('#homeGiftsEn'),gifts_image:await maybeUpload('#homeGiftsFile','home/gifts',val('#homeGiftsImage')),
      event_ar:val('#homeEventAr'),event_en:val('#homeEventEn'),event_image_1:await maybeUpload('#homeEventFile1','home/events',val('#homeEventImage1')),
      event_image_2:await maybeUpload('#homeEventFile2','home/events',val('#homeEventImage2')),
      story_ar:val('#homeStoryAr'),story_en:val('#homeStoryEn'),story_image:await maybeUpload('#homeStoryFile','home/story',val('#homeStoryImage'))
    };
    await putContent('home',value);setStatus('#homeStatus',txt('تم تحديث الصفحة الرئيسية.','Home page updated.'),'success');await loadHomeContent();
  }catch(err){console.error(err);setStatus('#homeStatus',err.message||String(err),'error')}
}

async function loadPageContent(){
  const key=A('#pageKey')?.value||'story',version=++pageLoadVersion;
  A('#eventGalleryFields')?.classList.toggle('hidden',key!=='event_cart');
  try{
    const v=await getContent('page_'+key);
    if(version!==pageLoadVersion||key!==(A('#pageKey')?.value||'story'))return;
    setVal('#pageTitleAr',v.title_ar);setVal('#pageTitleEn',v.title_en);setVal('#pageBodyAr',v.body_ar);setVal('#pageBodyEn',v.body_en);setVal('#pageImage',v.image_url);
    setVal('#pageGallery',Array.isArray(v.gallery)?v.gallery.join('\n'):'');
    if(A('#pageImageFile'))A('#pageImageFile').value='';
    if(A('#pageGalleryFiles'))A('#pageGalleryFiles').value='';
    setStatus('#pageStatus','');
  }catch(err){if(version!==pageLoadVersion)return;console.error(err);setStatus('#pageStatus',err.message||String(err),'error')}
}
async function savePageContent(e){
  e.preventDefault();setStatus('#pageStatus',txt('جاري الحفظ…','Saving…'));
  try{
    const key=A('#pageKey').value;
    let gallery=val('#pageGallery').split(/\n+/).map(s=>s.trim()).filter(Boolean);
    const galleryFiles=[...(A('#pageGalleryFiles')?.files||[])];
    for(const f of galleryFiles)gallery.push(await uploadImage(f,'pages/'+key+'/gallery'));
    const value={
      title_ar:val('#pageTitleAr'),title_en:val('#pageTitleEn'),body_ar:val('#pageBodyAr'),body_en:val('#pageBodyEn'),
      image_url:await maybeUpload('#pageImageFile','pages/'+key,val('#pageImage')),gallery
    };
    await putContent('page_'+key,value);setStatus('#pageStatus',txt('تم حفظ الصفحة.','Page saved.'),'success');await loadPageContent();
  }catch(err){console.error(err);setStatus('#pageStatus',err.message||String(err),'error')}
}

async function loadSettings(){
  try{
    const v=await getContent('settings');siteSettings={currency:'EGP',...v};
    setVal('#settingWhatsapp',siteSettings.whatsapp||'201112564000');setVal('#settingCurrency',siteSettings.currency||'EGP');
    setVal('#settingInstagram',siteSettings.instagram||'https://www.instagram.com/nadiasperfumecart');setVal('#settingTiktok',siteSettings.tiktok||'https://www.tiktok.com/@nadiasperfumecart');
    setVal('#settingFooterAr',siteSettings.footer_ar||'اتصمم خصيصاً عشان يبقى ليك ذكرى');setVal('#settingFooterEn',siteSettings.footer_en||'Designed specifically to be your memory');
    renderProducts();if(orders.length)renderOrders();
  }catch(err){console.error(err)}
}
async function saveSettings(e){
  e.preventDefault();setStatus('#settingsStatus',txt('جاري الحفظ…','Saving…'));
  try{
    const value={whatsapp:val('#settingWhatsapp').replace(/\D/g,''),currency:A('#settingCurrency').value,instagram:val('#settingInstagram'),tiktok:val('#settingTiktok'),footer_ar:val('#settingFooterAr'),footer_en:val('#settingFooterEn')};
    await putContent('settings',value);siteSettings=value;setStatus('#settingsStatus',txt('تم حفظ الإعدادات.','Settings saved.'),'success');renderProducts();renderOrders();
  }catch(err){console.error(err);setStatus('#settingsStatus',err.message||String(err),'error')}
}

async function loadAnnouncement(){
  const {data,error}=await sb.from('announcements').select('*').order('updated_at',{ascending:false}).limit(1).maybeSingle();
  if(error){console.error(error);return}
  if(data){setVal('#annId',data.id);setVal('#annAr',data.text_ar);setVal('#annEn',data.text_en);if(A('#annActive'))A('#annActive').checked=!!data.active}
}
async function saveAnnouncement(e){
  e.preventDefault();const id=val('#annId'),row={text_ar:val('#annAr'),text_en:val('#annEn'),active:checked('#annActive'),updated_at:new Date().toISOString()};
  const r=id?await sb.from('announcements').update(row).eq('id',id):await sb.from('announcements').insert(row);
  if(r.error)return alert(r.error.message);alert(txt('تم حفظ الإعلان.','Announcement saved.'));await loadAnnouncement();
}

function orderStatusLabel(value){
  const labels={new:['جديد','New'],confirmed:['مؤكد','Confirmed'],processing:['قيد التجهيز','Processing'],shipped:['تم الشحن','Shipped'],completed:['مكتمل','Completed'],cancelled:['ملغي','Cancelled']};
  const pair=labels[value];return pair?txt(pair[0],pair[1]):value;
}
async function loadOrders(){
  const {data,error}=await sb.from('store_orders').select('*').order('created_at',{ascending:false}).limit(100);
  if(error){console.error(error);orders=[];renderOrders();return}
  orders=data||[];renderOrders();updateMetrics();
}
function renderOrders(){
  const body=A('#ordersBody');if(!body)return;
  body.innerHTML=orders.map(o=>`<tr><td><b>${esc(o.order_number)}</b></td><td>${esc(o.customer_name)}<br><small>${esc(o.phone)}</small></td><td>${adminMoney(o.total)}</td><td><select onchange="setOrderStatus('${o.id}',this.value)">${['new','confirmed','processing','shipped','completed','cancelled'].map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${orderStatusLabel(s)}</option>`).join('')}</select></td><td>${adminDate(o.created_at)}</td></tr>`).join('')||`<tr><td colspan="5">${txt('لا توجد طلبات بعد.','No orders yet.')}</td></tr>`;
}
async function setOrderStatus(id,status){
  const {error}=await sb.from('store_orders').update({status,updated_at:new Date().toISOString()}).eq('id',id);
  if(error)return alert(error.message);const o=orders.find(x=>x.id===id);if(o)o.status=status;
}

const eventTypeLabel=value=>{const labels={wedding:['زفاف','Wedding'],engagement:['خطوبة','Engagement'],private_event:['مناسبة خاصة','Private event'],corporate:['فعالية شركات','Corporate event'],other:['أخرى','Other']};const pair=labels[value];return pair?txt(pair[0],pair[1]):value};
const eventStatusLabel=value=>{const labels={new:['جديد','New'],contacted:['تم التواصل','Contacted'],planning:['قيد التخطيط','Planning'],quoted:['تم تقديم السعر','Quoted'],confirmed:['مؤكد','Confirmed'],completed:['مكتمل','Completed'],cancelled:['ملغي','Cancelled']};const pair=labels[value];return pair?txt(pair[0],pair[1]):value};
async function loadEvents(){
  const {data,error}=await sb.from('event_requests').select('*').order('created_at',{ascending:false}).limit(100);
  if(error){console.error(error);events=[];renderEvents();return}
  events=data||[];renderEvents();updateMetrics();
}
function renderEvents(){
  const body=A('#eventsBody');if(!body)return;
  body.innerHTML=events.map(r=>`<tr><td><b>${esc(r.request_number)}</b></td><td>${esc(r.customer_name)}<br><small>${esc(r.phone)}${r.email?'<br>'+esc(r.email):''}</small></td><td>${esc(eventTypeLabel(r.event_type))}${r.venue?'<br><small>'+esc(r.venue)+'</small>':''}</td><td>${esc(r.event_date)}<br><small>${esc(r.city)}</small></td><td>${r.guest_count??'—'}</td><td><select onchange="setEventStatus('${r.id}',this.value)">${['new','contacted','planning','quoted','confirmed','completed','cancelled'].map(s=>`<option value="${s}" ${r.status===s?'selected':''}>${eventStatusLabel(s)}</option>`).join('')}</select></td><td style="min-width:240px">${esc(r.requirements)}${r.notes?'<br><small>'+esc(r.notes)+'</small>':''}</td></tr>`).join('')||`<tr><td colspan="7">${txt('لا توجد طلبات مناسبات بعد.','No event requests yet.')}</td></tr>`;
}
async function setEventStatus(id,status){
  const {error}=await sb.from('event_requests').update({status,updated_at:new Date().toISOString()}).eq('id',id);
  if(error)return alert(error.message);const r=events.find(x=>x.id===id);if(r)r.status=status;
}

document.addEventListener('languagechange',()=>{
  const active=AA('[data-admin-tab].active')[0]?.dataset.adminTab||'dashboard';
  openTab(active,null,{skipLoad:true});
  renderProducts();renderOrders();renderEvents();
});
document.addEventListener('DOMContentLoaded',init);
