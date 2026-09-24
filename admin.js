const cfg=window.NADIA_SUPABASE||{};
const sb=supabase.createClient(cfg.url,cfg.anonKey);
const $=s=>document.querySelector(s);
const $$=s=>Array.from(document.querySelectorAll(s));
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
let products=[];
let cms={};
let cmsPageLoaded=false;
let pageLoadVersion=0;
let settings={currency:'EGP',whatsapp:'201112564000'};

function setStatus(id,msg,type=''){
  const el=$(id);if(!el)return;
  el.textContent=msg||'';el.className='status-line'+(type?' '+type:'');
}
function cleanPhone(v=''){return String(v).replace(/[^0-9]/g,'')}
function currentCurrency(){return settings.currency||'EGP'}
function money(value){
  if(value==null||value==='')return '—';
  try{return new Intl.NumberFormat(lang==='ar'?'ar-EG':'en-GB',{style:'currency',currency:currentCurrency(),maximumFractionDigits:2}).format(Number(value))}
  catch(_){return Number(value).toFixed(2)+' '+currentCurrency()}
}
function dateTime(value){return value?new Date(value).toLocaleString(lang==='ar'?'ar-EG':'en-GB'):'—'}
function statusLabel(value){
  const labels={
    new:['جديد','New'],confirmed:['مؤكد','Confirmed'],processing:['قيد التجهيز','Processing'],preparing:['قيد التجهيز','Preparing'],
    shipped:['تم الشحن','Shipped'],completed:['مكتمل','Completed'],cancelled:['ملغي','Cancelled'],
    contacted:['تم التواصل','Contacted'],planning:['قيد التخطيط','Planning'],quoted:['تم تقديم السعر','Quoted']
  };
  const p=labels[value];return p?t(p[0],p[1]):value;
}
function eventTypeLabel(value){
  const labels={wedding:['زفاف','Wedding'],engagement:['خطوبة','Engagement'],private_event:['مناسبة خاصة','Private event'],corporate:['فعالية شركات','Corporate event'],other:['أخرى','Other']};
  const p=labels[value];return p?t(p[0],p[1]):value;
}

async function init(){
  const {data:{session}}=await sb.auth.getSession();
  if(session)await enterAdmin(session);else showLogin();
}
function showLogin(){$('#login').classList.remove('hidden');$('#app').classList.add('hidden')}
async function login(e){
  e.preventDefault();setStatus('#loginMsg',t('جاري تسجيل الدخول…','Signing in…'));
  const f=new FormData(e.target);
  const {data,error}=await sb.auth.signInWithPassword({email:String(f.get('email')||'').trim(),password:String(f.get('password')||'')});
  if(error){setStatus('#loginMsg',t('تعذر تسجيل الدخول. تحقق من البيانات.','Could not sign in. Check your details.'),'error');return}
  await enterAdmin(data.session);
}
async function enterAdmin(session){
  const {data:isAdmin,error}=await sb.rpc('is_admin');
  if(error||isAdmin!==true){
    await sb.auth.signOut();
    setStatus('#loginMsg',t('هذا الحساب لا يملك صلاحية الإدارة.','This account does not have admin access.'),'error');
    showLogin();return;
  }
  $('#login').classList.add('hidden');$('#app').classList.remove('hidden');
  $('#adminUser').textContent=session?.user?.email||t('مدير','Admin');
  await loadSettings();
  await Promise.all([loadProducts(),loadOrders(),loadEvents(),loadAnnouncement(),loadHomeContent(),loadCmsCache()]);
  await loadPageContent();
  updateDashboard();
}
async function logout(){await sb.auth.signOut();location.reload()}
async function refreshAll(){
  await loadSettings();
  await Promise.all([loadProducts(),loadOrders(),loadEvents(),loadAnnouncement(),loadHomeContent(),loadCmsCache()]);
  await loadPageContent();updateDashboard();
}

const tabMeta={
  dashboard:['نظرة عامة','Dashboard','إدارة الموقع من لوحة واحدة.','Manage your website from one dashboard.'],
  products:['المنتجات','Products','الأسعار والمخزون والصور والتوفر.','Prices, stock, images and availability.'],
  home:['الصفحة الرئيسية','Home page','عدّل أقسام الهوم وصورها.','Edit the home sections and images.'],
  pages:['الصفحات','Pages','عدّل أهم النصوص والصور للصفحات الداخلية.','Edit key text and images on inner pages.'],
  settings:['إعدادات الموقع','Site settings','بيانات التواصل والعملة والإعلان.','Contact details, currency and announcement.'],
  orders:['الطلبات','Orders','متابعة طلبات المتجر وتحديث حالتها.','Review store orders and update status.'],
  events:['طلبات المناسبات','Event requests','متابعة طلبات عربة المناسبات.','Review Event Cart requests.']
};
function openTab(name,button){
  $$('.admin-tab').forEach(x=>x.classList.toggle('active',x.id==='tab-'+name));
  $$('.admin-nav button').forEach(x=>x.classList.toggle('active',x.dataset.adminTab===name));
  const m=tabMeta[name]||tabMeta.dashboard;
  const title=$('#tabTitle'),sub=$('#tabSubtitle');
  title.dataset.ar=m[0];title.dataset.en=m[1];title.textContent=lang==='ar'?m[0]:m[1];
  sub.dataset.ar=m[2];sub.dataset.en=m[3];sub.textContent=lang==='ar'?m[2]:m[3];
  if(name==='pages' && !cmsPageLoaded)loadPageContent();
  window.scrollTo({top:0,behavior:'smooth'});
}
function updateDashboard(){
  $('#metricProducts').textContent=products.length;
  $('#metricAvailable').textContent=products.filter(p=>p.active&&Number(p.stock)>0).length;
}

async function loadCmsCache(){
  const {data,error}=await sb.from('site_content').select('key,value');
  if(error)return;
  cms={};(data||[]).forEach(r=>cms[r.key]=r.value||{});
}
async function saveCms(key,value){
  const {error}=await sb.from('site_content').upsert({key,value,updated_at:new Date().toISOString()},{onConflict:'key'}).select('key').single();
  if(error)throw error;cms[key]=value;
}

async function uploadImage(file,folder='misc'){
  if(!file)return null;
  if(file.size>8*1024*1024)throw new Error(t('حجم الصورة يجب ألا يتجاوز 8MB.','Image must be 8MB or smaller.'));
  const allowed=['image/jpeg','image/png','image/webp'];
  if(!allowed.includes(file.type))throw new Error(t('استخدم JPG أو PNG أو WEBP فقط.','Use JPG, PNG or WEBP only.'));
  const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
  const base=(file.name.replace(/\.[^.]+$/,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,42)||'image');
  const path=folder+'/'+Date.now()+'-'+Math.random().toString(36).slice(2,8)+'-'+base+'.'+ext;
  const {error}=await sb.storage.from('site-media').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
  if(error)throw error;
  const {data}=sb.storage.from('site-media').getPublicUrl(path);
  return data.publicUrl;
}
async function uploadFromInput(inputId,folder,current=''){
  const input=$(inputId);const file=input?.files?.[0];
  if(!file)return current||'';
  return await uploadImage(file,folder);
}

async function loadProducts(){
  const {data,error}=await sb.from('products').select('*').order('created_at');
  if(error){alert(error.message);return}
  products=data||[];renderProducts();updateDashboard();
}
function renderProducts(){
  const q=String($('#productSearch')?.value||'').trim().toLowerCase();
  const rows=products.filter(p=>!q||[p.name_ar,p.name_en,p.slug].some(v=>String(v||'').toLowerCase().includes(q)));
  $('#productsBody').innerHTML=rows.map(p=>{
    const available=p.active&&Number(p.stock)>0;
    const visible=!!p.active;
    const img=p.image_url?'<img src="'+esc(p.image_url)+'" alt="" onerror="this.style.visibility=\'hidden\'">':'<span class="admin-pill">—</span>';
    return '<tr>'+
      '<td>'+img+'</td>'+
      '<td><b>'+esc(p.name_ar)+'</b><br><small>'+esc(p.name_en)+' · '+esc(p.slug)+'</small></td>'+
      '<td>'+money(p.price)+(p.compare_at_price?'<br><small><s>'+money(p.compare_at_price)+'</s></small>':'')+'</td>'+
      '<td>'+esc(p.stock??0)+'</td>'+
      '<td><span class="admin-pill '+(available?'on':'off')+'">'+(available?t('متوفر','Available'):t('غير متوفر','Unavailable'))+'</span></td>'+
      '<td><div class="admin-actions"><button class="admin-btn small" onclick="editProduct(\''+esc(p.id)+'\')">'+t('تعديل','Edit')+'</button><button class="admin-btn small" onclick="toggleAvailability(\''+esc(p.id)+'\','+(visible?'false':'true')+')">'+(visible?t('إخفاء','Hide'):t('إظهار','Show'))+'</button></div></td>'+
    '</tr>';
  }).join('')||'<tr><td colspan="6">'+t('لا توجد نتائج.','No results.')+'</td></tr>';
}
async function toggleAvailability(id,makeAvailable){
  const p=products.find(x=>x.id===id);if(!p)return;
  if(makeAvailable&&!(Number(p.stock)>0)){editProduct(id);alert(t('أدخل كمية مخزون أكبر من صفر أولاً.','Enter stock greater than zero first.'));return}
  const {error}=await sb.from('products').update({active:makeAvailable,updated_at:new Date().toISOString()}).eq('id',id).select('id').single();
  if(error)return alert(error.message);await loadProducts();
}
function newProduct(){
  $('#productForm').reset();$('#pid').value='';$('#productImagePreview').classList.remove('show');$('#productImagePreview').removeAttribute('src');
  $('#productEditor').classList.remove('hidden');setStatus('#productStatus','');
}
function editProduct(id){
  const p=products.find(x=>x.id===id);if(!p)return;
  $('#productForm').reset();
  for(const k of ['id','slug','name_ar','name_en','price','compare_at_price','size_ml','stock','image_url','description_ar','description_en']){
    const el=$('[name="'+k+'"]');if(el)el.value=p[k]??'';
  }
  $('[name="active"]').checked=!!p.active;$('[name="featured"]').checked=!!p.featured;
  previewProductImage();$('#productEditor').classList.remove('hidden');setStatus('#productStatus','');
}
function closeProductEditor(){$('#productEditor').classList.add('hidden')}
function previewProductImage(){
  const url=$('#productImageUrl').value.trim(),img=$('#productImagePreview');
  if(url){img.src=url;img.classList.add('show')}else{img.removeAttribute('src');img.classList.remove('show')}
}
function previewLocalProductImage(input){
  const file=input.files?.[0];if(!file)return previewProductImage();
  const img=$('#productImagePreview');img.src=URL.createObjectURL(file);img.classList.add('show');
}
async function saveProduct(e){
  e.preventDefault();setStatus('#productStatus',t('جاري الحفظ…','Saving…'));
  try{
    const f=new FormData(e.target),id=String(f.get('id')||'');
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(f.get('slug')||'').trim()))throw new Error(t('استخدم حروفاً إنجليزية صغيرة وأرقاماً وشرطات لرابط المنتج.','Use lowercase letters, numbers and hyphens for the product slug.'));
    let imageUrl=String(f.get('image_url')||'').trim();
    if($('#productImageFile').files?.[0])imageUrl=await uploadImage($('#productImageFile').files[0],'products');
    const row={
      slug:String(f.get('slug')||'').trim(),name_ar:String(f.get('name_ar')||'').trim(),name_en:String(f.get('name_en')||'').trim(),
      price:f.get('price')===''?null:Number(f.get('price')),compare_at_price:f.get('compare_at_price')===''?null:Number(f.get('compare_at_price')),
      size_ml:f.get('size_ml')===''?null:Number(f.get('size_ml')),stock:f.get('stock')===''?0:Number(f.get('stock')),
      image_url:imageUrl||null,description_ar:String(f.get('description_ar')||'').trim()||null,description_en:String(f.get('description_en')||'').trim()||null,
      active:f.get('active')==='on',featured:f.get('featured')==='on',updated_at:new Date().toISOString()
    };
    const r=id?await sb.from('products').update(row).eq('id',id).select('id').single():await sb.from('products').insert(row).select('id').single();
    if(r.error)throw r.error;
    setStatus('#productStatus',t('تم الحفظ.','Saved.'),'success');await loadProducts();closeProductEditor();
  }catch(err){setStatus('#productStatus',err.message||String(err),'error')}
}

async function loadHomeContent(){
  const {data,error}=await sb.from('site_content').select('value').eq('key','home').maybeSingle();
  if(error&&!/does not exist|schema cache/i.test(error.message))console.warn(error.message);
  const v=data?.value||{};
  const pairs={
    homeHeroAr:v.hero_ar,homeHeroEn:v.hero_en,homeHeroImage:v.hero_image,
    homeGiftsAr:v.gifts_ar,homeGiftsEn:v.gifts_en,homeGiftsImage:v.gifts_image,
    homeEventAr:v.event_ar,homeEventEn:v.event_en,homeEventImage1:v.event_image_1,homeEventImage2:v.event_image_2,
    homeStoryAr:v.story_ar,homeStoryEn:v.story_en,homeStoryImage:v.story_image
  };
  Object.entries(pairs).forEach(([id,val])=>{if($('#'+id))$('#'+id).value=val||''});
  cms.home=v;
}
async function saveHomeContent(e){
  e.preventDefault();setStatus('#homeStatus',t('جاري رفع الصور والحفظ…','Uploading and saving…'));
  try{
    const v={
      hero_ar:$('#homeHeroAr').value.trim(),hero_en:$('#homeHeroEn').value.trim(),
      hero_image:await uploadFromInput('#homeHeroFile','home/hero',$('#homeHeroImage').value.trim()),
      gifts_ar:$('#homeGiftsAr').value.trim(),gifts_en:$('#homeGiftsEn').value.trim(),
      gifts_image:await uploadFromInput('#homeGiftsFile','home/gifts',$('#homeGiftsImage').value.trim()),
      event_ar:$('#homeEventAr').value.trim(),event_en:$('#homeEventEn').value.trim(),
      event_image_1:await uploadFromInput('#homeEventFile1','home/events',$('#homeEventImage1').value.trim()),
      event_image_2:await uploadFromInput('#homeEventFile2','home/events',$('#homeEventImage2').value.trim()),
      story_ar:$('#homeStoryAr').value.trim(),story_en:$('#homeStoryEn').value.trim(),
      story_image:await uploadFromInput('#homeStoryFile','home/story',$('#homeStoryImage').value.trim())
    };
    await saveCms('home',v);clearUploads(e.target);setStatus('#homeStatus',t('تم تحديث الصفحة الرئيسية.','Home page updated.'),'success');await loadHomeContent();
  }catch(err){setStatus('#homeStatus',err.message||String(err),'error')}
}

function selectedPage(){return $('#pageKey')?.value||'story'}
function pageDbKey(){return 'page_'+selectedPage()}
async function loadPageContent(){
  if(!$('#pageKey'))return;
  const page=selectedPage(),key='page_'+page,version=++pageLoadVersion;
  $('#pageForm').reset();cmsPageLoaded=false;
  $('#eventGalleryFields').classList.toggle('hidden',page!=='event_cart');
  let v=cms[key];
  if(!v){
    const {data}=await sb.from('site_content').select('value').eq('key',key).maybeSingle();v=data?.value||{};cms[key]=v;
  }
  if(version!==pageLoadVersion||selectedPage()!==page)return;
  cmsPageLoaded=true;
  $('#pageTitleAr').value=v.title_ar||'';$('#pageTitleEn').value=v.title_en||'';
  $('#pageBodyAr').value=v.body_ar||'';$('#pageBodyEn').value=v.body_en||'';$('#pageImage').value=v.image_url||'';
  $('#pageGallery').value=Array.isArray(v.gallery)?v.gallery.join('\n'):'';
  setStatus('#pageStatus','');
}
async function savePageContent(e){
  e.preventDefault();setStatus('#pageStatus',t('جاري الحفظ…','Saving…'));
  try{
    if(!cmsPageLoaded)throw new Error(t('انتظر تحميل الصفحة أولاً.','Wait for the page to load first.'));
    let image=$('#pageImage').value.trim();
    if($('#pageImageFile').files?.[0])image=await uploadImage($('#pageImageFile').files[0],'pages/'+selectedPage());
    let gallery=$('#pageGallery').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const galleryFiles=Array.from($('#pageGalleryFiles').files||[]);
    for(const file of galleryFiles)gallery.push(await uploadImage(file,'pages/event-cart'));
    gallery=[...new Set(gallery)];
    const v={title_ar:$('#pageTitleAr').value.trim(),title_en:$('#pageTitleEn').value.trim(),body_ar:$('#pageBodyAr').value.trim(),body_en:$('#pageBodyEn').value.trim(),image_url:image||'',gallery};
    await saveCms(pageDbKey(),v);clearUploads(e.target);$('#pageImage').value=image;$('#pageGallery').value=gallery.join('\n');setStatus('#pageStatus',t('تم حفظ الصفحة.','Page saved.'),'success');
  }catch(err){setStatus('#pageStatus',err.message||String(err),'error')}
}

async function loadSettings(){
  const {data,error}=await sb.from('site_content').select('value').eq('key','settings').maybeSingle();
  if(error&&!/does not exist|schema cache/i.test(error.message))console.warn(error.message);
  settings={currency:'EGP',whatsapp:'201112564000',...(data?.value||{})};cms.settings=settings;
  if($('#settingWhatsapp'))$('#settingWhatsapp').value=settings.whatsapp||'';
  if($('#settingCurrency'))$('#settingCurrency').value=settings.currency||'EGP';
  if($('#settingInstagram'))$('#settingInstagram').value=settings.instagram||'';
  if($('#settingTiktok'))$('#settingTiktok').value=settings.tiktok||'';
  if($('#settingFooterAr'))$('#settingFooterAr').value=settings.footer_ar||'';
  if($('#settingFooterEn'))$('#settingFooterEn').value=settings.footer_en||'';
  renderProducts();
}
async function saveSettings(e){
  e.preventDefault();setStatus('#settingsStatus',t('جاري الحفظ…','Saving…'));
  try{
    const v={whatsapp:cleanPhone($('#settingWhatsapp').value),currency:$('#settingCurrency').value,instagram:$('#settingInstagram').value.trim(),tiktok:$('#settingTiktok').value.trim(),footer_ar:$('#settingFooterAr').value.trim(),footer_en:$('#settingFooterEn').value.trim()};
    await saveCms('settings',v);settings=v;setStatus('#settingsStatus',t('تم حفظ الإعدادات.','Settings saved.'),'success');renderProducts();
  }catch(err){setStatus('#settingsStatus',err.message||String(err),'error')}
}

async function loadAnnouncement(){
  const {data,error}=await sb.from('announcements').select('*').order('updated_at',{ascending:false}).limit(1).maybeSingle();
  if(error)return;
  if(data){$('#annId').value=data.id;$('#annAr').value=data.text_ar||'';$('#annEn').value=data.text_en||'';$('#annActive').checked=!!data.active}
}
async function saveAnnouncement(e){
  e.preventDefault();const id=$('#annId').value;
  const row={text_ar:$('#annAr').value.trim(),text_en:$('#annEn').value.trim(),active:$('#annActive').checked,updated_at:new Date().toISOString()};
  const r=id?await sb.from('announcements').update(row).eq('id',id):await sb.from('announcements').insert(row).select().single();
  if(r.error)return alert(r.error.message);if(!id&&r.data)$('#annId').value=r.data.id;alert(t('تم حفظ الإعلان.','Announcement saved.'));
}

async function loadOrders(){
  const {data,error}=await sb.from('store_orders').select('*').order('created_at',{ascending:false}).limit(200);
  if(error){$('#ordersBody').innerHTML='<tr><td colspan="5">'+esc(error.message)+'</td></tr>';return}
  const rows=data||[];$('#metricOrders').textContent=rows.length;
  $('#ordersBody').innerHTML=rows.map(o=>'<tr><td><b>'+esc(o.order_number)+'</b></td><td>'+esc(o.customer_name)+'<br><small>'+esc(o.phone)+(o.email?'<br>'+esc(o.email):'')+'</small></td><td>'+money(o.total)+'</td><td><select onchange="setOrderStatus(\''+esc(o.id)+'\',this.value)">'+['new','confirmed','processing','shipped','completed','cancelled'].map(s=>'<option value="'+s+'" '+(o.status===s?'selected':'')+'>'+statusLabel(s)+'</option>').join('')+'</select></td><td>'+dateTime(o.created_at)+'</td></tr>').join('')||'<tr><td colspan="5">'+t('لا توجد طلبات بعد.','No orders yet.')+'</td></tr>';
}
async function setOrderStatus(id,status){
  const {error}=await sb.from('store_orders').update({status,updated_at:new Date().toISOString()}).eq('id',id).select('id').single();if(error){alert(error.message);await loadOrders();}
}

async function loadEvents(){
  const {data,error}=await sb.from('event_requests').select('*').order('created_at',{ascending:false}).limit(200);
  if(error){$('#eventsBody').innerHTML='<tr><td colspan="7">'+esc(error.message)+'</td></tr>';return}
  const rows=data||[];$('#metricEvents').textContent=rows.length;
  $('#eventsBody').innerHTML=rows.map(r=>'<tr><td><b>'+esc(r.request_number)+'</b></td><td>'+esc(r.customer_name)+'<br><small>'+esc(r.phone)+(r.email?'<br>'+esc(r.email):'')+'</small></td><td>'+esc(eventTypeLabel(r.event_type))+(r.venue?'<br><small>'+esc(r.venue)+'</small>':'')+'</td><td>'+esc(r.event_date)+'<br><small>'+esc(r.city)+'</small></td><td>'+esc(r.guest_count??'—')+'</td><td><select onchange="setEventStatus(\''+esc(r.id)+'\',this.value)">'+['new','contacted','planning','quoted','confirmed','completed','cancelled'].map(s=>'<option value="'+s+'" '+(r.status===s?'selected':'')+'>'+statusLabel(s)+'</option>').join('')+'</select></td><td style="min-width:220px">'+esc(r.requirements)+(r.notes?'<br><small>'+esc(r.notes)+'</small>':'')+'</td></tr>').join('')||'<tr><td colspan="7">'+t('لا توجد طلبات مناسبات بعد.','No event requests yet.')+'</td></tr>';
}
async function setEventStatus(id,status){
  const {error}=await sb.from('event_requests').update({status,updated_at:new Date().toISOString()}).eq('id',id).select('id').single();if(error){alert(error.message);await loadEvents();}
}

document.addEventListener('DOMContentLoaded',init);
document.addEventListener('languagechange',()=>{
  const active=$('.admin-nav button.active')?.dataset.adminTab||'dashboard';openTab(active);
  renderProducts();loadOrders();loadEvents();

});


// Lock editing during each save so page selection and FormData stay consistent.
function clearUploads(form){form.querySelectorAll('input[type=file]').forEach(input=>input.value='')}
function guardSave(handler){
  return async function(event){
    event.preventDefault();
    const form=event.target;
    if(form.dataset.saving==='true')return;
    form.dataset.saving='true';form.setAttribute('aria-busy','true');
    const controls=Array.from(document.querySelectorAll('button,select,input,textarea'));
    const disabled=controls.map(el=>el.disabled);
    // Start synchronously: handlers must read FormData before controls are disabled.
    const pending=handler(event);
    controls.forEach(el=>el.disabled=true);
    try{await pending}finally{
      controls.forEach((el,i)=>el.disabled=disabled[i]);
      delete form.dataset.saving;form.removeAttribute('aria-busy');
    }
  };
}
saveProduct=guardSave(saveProduct);
saveHomeContent=guardSave(saveHomeContent);
savePageContent=guardSave(savePageContent);
saveSettings=guardSave(saveSettings);
saveAnnouncement=guardSave(saveAnnouncement);
