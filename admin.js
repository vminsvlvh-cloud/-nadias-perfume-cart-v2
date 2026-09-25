const cfg=window.NADIA_SUPABASE||{};
const sb=window.supabase&&cfg.url&&cfg.anonKey?supabase.createClient(cfg.url,cfg.anonKey):null;
const MEDIA_BUCKET='site-media';
let products=[],orders=[],events=[],siteSettings={currency:'EGP'},currentUser=null;
let pageLoadVersion=0,orderPage=0,eventPage=0,orderCount=0,eventCount=0,orderLoadVersion=0,eventLoadVersion=0;
const contentVersions={},contentValues={};
let editingVersion=null;

const A=s=>document.querySelector(s);
const AA=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const txt=(ar,en)=>typeof t==='function'?t(ar,en):(document.documentElement.lang==='ar'?ar:en);
const setStatus=(id,message,type='')=>{const el=A(id);if(!el)return;el.textContent=message||'';el.className='status-line'+(type?' '+type:'')};
const val=id=>A(id)?.value?.trim()||'';
const setVal=(id,value='')=>{const el=A(id);if(el)el.value=value??''};
const checked=id=>!!A(id)?.checked;

async function init(){
  if(!sb)return showLogin(txt('تعذر تحميل الاتصال. أعد تحميل الصفحة.','Connection could not load. Reload the page.'));
  const {data:{session}}=await sb.auth.getSession();
  if(!session)return showLogin();
  if(!await requireMfa())return;
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
function showLogin(message=''){if(A('#loginForm [type=submit]'))A('#loginForm [type=submit]').disabled=!sb;A('#login')?.classList.remove('hidden');A('#app')?.classList.add('hidden');if(message)setStatus('#loginMsg',message,'error')}
async function login(e){
 e.preventDefault();if(!sb)return showLogin(txt('تعذر تحميل الاتصال. أعد تحميل الصفحة.','Connection unavailable. Reload the page.'));
 const f=new FormData(e.target);if(!lockForm(e.target))return;setStatus('#loginMsg',txt('جاري تسجيل الدخول…','Signing in…'));
 try{const {error}=await sb.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});if(error)throw error;await init();}
 catch(error){setStatus('#loginMsg',txt('تعذر تسجيل الدخول. راجع البريد وكلمة المرور والاتصال.','Sign-in failed. Check your email, password and connection.'),'error');}
 finally{unlockForm(e.target);}
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
  if(document.querySelector('form[data-saving]'))return;
  await Promise.allSettled([loadProducts(),loadOrders(),loadEvents(),loadAnnouncement(),loadHomeContent(),loadSettings()]);
  updateMetrics();
}
function updateMetrics(){
  if(A('#metricProducts'))A('#metricProducts').textContent=products.length;
  if(A('#metricAvailable'))A('#metricAvailable').textContent=products.filter(p=>NadiaStore.purchasable(p)).length;
  if(A('#metricOrders'))A('#metricOrders').textContent=orderCount;
  if(A('#metricEvents'))A('#metricEvents').textContent=eventCount;
}
function adminMoney(value,currency=siteSettings.currency||'EGP'){
  if(value==null||value==='')return '—';
  try{return new Intl.NumberFormat(lang==='ar'?'ar-EG':'en-GB',{style:'currency',currency,maximumFractionDigits:2}).format(Number(value||0))}
  catch(_){return Number(value||0).toFixed(2)+' '+currency}
}
const adminDate=value=>value?new Date(value).toLocaleString(lang==='ar'?'ar-EG':'en-GB'):'—';

async function loadProducts(){
  const {data,error}=await sb.from('products').select('*').order('created_at');
  if(error){A('#productsBody').innerHTML='<tr><td colspan=6>'+txt('تعذر تحميل المنتجات. أعد المحاولة.','Could not load products. Please retry.')+'</td></tr>';return}
  products=data||[];renderProducts();updateMetrics();if(A('#storeReadiness'))loadCommerceSettings();
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
      <td><div class="admin-actions"><button class="admin-btn small" onclick="editProduct('${p.id}')">${txt('تعديل','Edit')}</button><button class="admin-btn small" onclick="toggleAvailability('${p.id}',${p.active?'false':'true'})">${p.active?txt('إخفاء','Hide'):txt('إظهار','Show')}</button></div></td>
    </tr>`;
  }).join('')||`<tr><td colspan="6">${txt('لا توجد منتجات.','No products found.')}</td></tr>`;
}
function newProduct(){
  if(A('#productForm')?.dataset.saving)return;editingVersion=null;
  A('#productForm')?.reset();setVal('#pid','');if(A('[name="active"]'))A('[name="active"]').checked=true;
  setStatus('#productStatus','');A('#productImagePreview')?.classList.remove('show');A('#productEditor')?.classList.remove('hidden');
}
function closeProductEditor(){if(A('#productForm')?.dataset.saving)return;A('#productEditor')?.classList.add('hidden');setStatus('#productStatus','')}
function editProduct(id){
  if(A('#productForm')?.dataset.saving)return;
  const p=products.find(x=>x.id===id);if(!p)return;A('#productForm').reset();editingVersion=p.updated_at;setStatus('#productStatus','');
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
  const url=URL.createObjectURL(file);img.onload=()=>URL.revokeObjectURL(url);img.src=url;img.classList.add('show');
}
async function uploadImage(file,folder='general'){
  if(!file)return null;
  const allowed=['image/jpeg','image/png','image/webp'];
  if(!allowed.includes(file.type))throw new Error(txt('الصورة يجب أن تكون JPG أو PNG أو WEBP.','Image must be JPG, PNG or WEBP.'));
  if(file.size>8*1024*1024)throw new Error(txt('حجم الصورة يجب ألا يتجاوز 8MB.','Image must be 8MB or smaller.'));
  file=await compressImage(file);
  const ext=file.type==='image/webp'?'webp':file.type==='image/png'?'png':'jpg';
  const id=(crypto.randomUUID?.()||Math.random().toString(36).slice(2));
  const path=`${folder}/${Date.now()}-${id}.${ext}`;
  const {error}=await sb.storage.from(MEDIA_BUCKET).upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type});
  if(error)throw error;
  const {data}=sb.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
async function toggleAvailability(id,makeAvailable){
  const p=products.find(x=>x.id===id);if(!p)return;
  if(makeAvailable&&!(Number(p.stock)>0&&Number(p.price)>0)){editProduct(id);A('[name="stock"]')?.focus();return alert(txt('أدخل كمية المخزون أولاً.','Enter stock quantity first.'))}
  const {error}=await sb.from('products').update({active:makeAvailable,updated_at:new Date().toISOString()}).eq('id',id).eq('updated_at',p.updated_at).select('id').single();
  if(error)return alert(txt('تغيّر المنتج أو تعذر الحفظ. حدّث الصفحة.','Product changed or could not save. Refresh the page.'));await loadProducts();
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
      ?await sb.from('products').update(row).eq('id',id).eq('updated_at',editingVersion).select('id,slug').single()
      :await sb.from('products').insert(row).select('id,slug').single();
    if(r.error){if(r.error.code==='PGRST116')throw new Error(txt('تغيّر المنتج أو المخزون. أعد فتحه قبل الحفظ.','Product or stock changed. Reopen it before saving.'));throw r.error;}
    if(A('#productImageFile'))A('#productImageFile').value='';
    setVal('#productImageUrl',imageUrl||'');
    setStatus('#productStatus',txt('تم الحفظ.','Saved.'),'success');
    await loadProducts();A('#productEditor').classList.add('hidden');
  }catch(err){
    console.error(err);setStatus('#productStatus',err.message||String(err),'error');
  }finally{
    delete form.dataset.saving;if(submit)submit.disabled=false;
  }
}

async function getContent(key){
 const {data,error}=await sb.from('site_content').select('value,updated_at').eq('key',key).maybeSingle();
 if(error)throw error;contentVersions[key]=data?.updated_at||null;contentValues[key]=data?.value||{};return data?.value||{};
}
async function putContent(key,value){
 if(!(key in contentVersions))throw new Error(txt('حمّل المحتوى أولًا قبل الحفظ.','Load the content before saving.'));
 const {data,error}=await sb.rpc('save_site_content',{content_key:key,content_value:value,expected_updated_at:contentVersions[key]});
 if(error)throw new Error(NadiaStore.error(error,lang==='ar'));contentVersions[key]=data;contentValues[key]=value;
}
function lockForm(form){
 if(form.dataset.saving)return false;form.dataset.saving='1';
 form.querySelectorAll('input,textarea,select,button').forEach(el=>{el.dataset.wasDisabled=String(el.disabled);el.disabled=true;});return true;
}
function unlockForm(form){delete form.dataset.saving;form.querySelectorAll('[data-was-disabled]').forEach(el=>{el.disabled=el.dataset.wasDisabled==='true';delete el.dataset.wasDisabled;});}

async function maybeUpload(fileId,folder,current=''){
  const file=A(fileId)?.files?.[0];return file?await uploadImage(file,folder):current;
}
async function loadHomeContent(){
  try{
    const v={...window.NADIA_HOME_DEFAULTS,...await getContent('home')};
    setVal('#homeHeroAr',v.hero_ar);setVal('#homeHeroEn',v.hero_en);setVal('#homeHeroImage',v.hero_image);
    setVal('#homeGiftsAr',v.gifts_ar);setVal('#homeGiftsEn',v.gifts_en);setVal('#homeGiftsImage',v.gifts_image);
    setVal('#homeEventAr',v.event_ar);setVal('#homeEventEn',v.event_en);setVal('#homeEventImage1',v.event_image_1);setVal('#homeEventImage2',v.event_image_2);
    setVal('#homeStoryAr',v.story_ar);setVal('#homeStoryEn',v.story_en);setVal('#homeStoryImage',v.story_image);
  }catch(err){console.error(err)}
}
async function saveHomeContent(e){
  e.preventDefault();if(!lockForm(e.target))return;setStatus('#homeStatus',txt('جاري الحفظ…','Saving…'));
  try{
    const value={
      hero_ar:val('#homeHeroAr'),hero_en:val('#homeHeroEn'),hero_image:await maybeUpload('#homeHeroFile','home/hero',val('#homeHeroImage')),
      gifts_ar:val('#homeGiftsAr'),gifts_en:val('#homeGiftsEn'),gifts_image:await maybeUpload('#homeGiftsFile','home/gifts',val('#homeGiftsImage')),
      event_ar:val('#homeEventAr'),event_en:val('#homeEventEn'),event_image_1:await maybeUpload('#homeEventFile1','home/events',val('#homeEventImage1')),
      event_image_2:await maybeUpload('#homeEventFile2','home/events',val('#homeEventImage2')),
      story_ar:val('#homeStoryAr'),story_en:val('#homeStoryEn'),story_image:await maybeUpload('#homeStoryFile','home/story',val('#homeStoryImage'))
    };
    await putContent('home',{...contentValues.home,...value});e.target.querySelectorAll('[type=file]').forEach(el=>el.value='');setStatus('#homeStatus',txt('تم تحديث الصفحة الرئيسية.','Home page updated.'),'success');await loadHomeContent();
  }catch(err){console.error(err);setStatus('#homeStatus',err.message||String(err),'error')}finally{unlockForm(e.target)}
}

async function loadPageContent(){
  if(A('#pageForm')?.dataset.saving)return;
  const key=A('#pageKey')?.value||'story',version=++pageLoadVersion;
  A('#pageForm').querySelector('[type=submit]').disabled=true;
  A('#eventGalleryFields')?.classList.toggle('hidden',key!=='event_cart');
  try{
    const v=await getContent('page_'+key);
    if(version!==pageLoadVersion||key!==(A('#pageKey')?.value||'story'))return;
    setVal('#pageTitleAr',v.title_ar);setVal('#pageTitleEn',v.title_en);setVal('#pageBodyAr',v.body_ar);setVal('#pageBodyEn',v.body_en);setVal('#pageImage',v.image_url);
    setVal('#pageGallery',v.gallery_managed?(v.gallery||[]).join('\n'):(window.NADIA_EVENT_GALLERY||[]).join('\n'));
    if(v.image_url===undefined)setVal('#pageImage',window.NADIA_PAGE_IMAGES?.[key]||'');
    renderPageBlocks(key,v.blocks||[]);A('#pageForm').querySelector('[type=submit]').disabled=false;
    if(A('#pageImageFile'))A('#pageImageFile').value='';
    if(A('#pageGalleryFiles'))A('#pageGalleryFiles').value='';
    setStatus('#pageStatus','');
  }catch(err){if(version!==pageLoadVersion)return;console.error(err);setStatus('#pageStatus',err.message||String(err),'error')}
}
async function savePageContent(e){
  e.preventDefault();if(!lockForm(e.target))return;A('#pageKey').disabled=true;setStatus('#pageStatus',txt('جاري الحفظ…','Saving…'));
  try{
    const key=A('#pageKey').value;
    let gallery=val('#pageGallery').split(/\n+/).map(s=>s.trim()).filter(Boolean);
    const galleryFiles=[...(A('#pageGalleryFiles')?.files||[])];
    for(const f of galleryFiles)gallery.push(await uploadImage(f,'pages/'+key+'/gallery'));
    const value={...contentValues['page_'+key],blocks:readPageBlocks(),gallery_managed:key==='event_cart',
      title_ar:val('#pageTitleAr'),title_en:val('#pageTitleEn'),body_ar:val('#pageBodyAr'),body_en:val('#pageBodyEn'),
      image_url:await maybeUpload('#pageImageFile','pages/'+key,val('#pageImage')),gallery
    };
    await putContent('page_'+key,value);setStatus('#pageStatus',txt('تم حفظ الصفحة.','Page saved.'),'success');e.target.querySelectorAll('[type=file]').forEach(el=>el.value='');
  }catch(err){console.error(err);setStatus('#pageStatus',err.message||String(err),'error')}finally{unlockForm(e.target);A('#pageKey').disabled=false;}
}

async function loadSettings(){
  try{
    const v=await getContent('settings');siteSettings={currency:'EGP',...v};
    setVal('#settingWhatsapp',siteSettings.whatsapp||'201112564000');setVal('#settingCurrency',siteSettings.currency||'EGP');
    setVal('#settingInstagram',siteSettings.instagram||'https://www.instagram.com/nadiasperfumecart');setVal('#settingTiktok',siteSettings.tiktok||'https://www.tiktok.com/@nadiasperfumecart');
    setVal('#settingFooterAr',siteSettings.footer_ar||'اتصمم خصيصاً عشان يبقى ليك ذكرى');setVal('#settingFooterEn',siteSettings.footer_en||'Designed specifically to be your memory');
    loadCommerceSettings();renderProducts();if(orders.length)renderOrders();
  }catch(err){console.error(err)}
}
async function saveSettings(e){
  e.preventDefault();if(!lockForm(e.target))return;setStatus('#settingsStatus',txt('جاري الحفظ…','Saving…'));
  try{
    const value={...siteSettings,...readCommerceSettings(),whatsapp:val('#settingWhatsapp').replace(/\D/g,''),currency:A('#settingCurrency').value,instagram:val('#settingInstagram'),tiktok:val('#settingTiktok'),footer_ar:val('#settingFooterAr'),footer_en:val('#settingFooterEn')};
    for(const key of ['instagram','tiktok'])if(value[key]&&!NadiaStore.httpsUrl(value[key]))throw new Error(txt('استخدم روابط HTTPS صحيحة.','Use valid HTTPS links.'));
    await putContent('settings',value);siteSettings=value;setStatus('#settingsStatus',txt('تم حفظ الإعدادات.','Settings saved.'),'success');renderProducts();renderOrders();
  }catch(err){console.error(err);setStatus('#settingsStatus',err.message||String(err),'error')}finally{unlockForm(e.target)}
}

async function loadAnnouncement(){
  const {data,error}=await sb.from('announcements').select('*').order('updated_at',{ascending:false}).limit(1).maybeSingle();
  if(error){console.error(error);return}
  if(data){setVal('#annId',data.id);setVal('#annAr',data.text_ar);setVal('#annEn',data.text_en);if(A('#annActive'))A('#annActive').checked=!!data.active}
}
async function saveAnnouncement(e){
 e.preventDefault();if(!lockForm(e.target))return;
 try{const id=val('#annId'),row={text_ar:val('#annAr'),text_en:val('#annEn'),active:checked('#annActive'),updated_at:new Date().toISOString()};
 const r=id?await sb.from('announcements').update(row).eq('id',id).select('id').single():await sb.from('announcements').insert(row).select('id').single();
 if(r.error)throw r.error;await loadAnnouncement();alert(txt('تم حفظ الإعلان.','Announcement saved.'));
 }catch(error){alert(NadiaStore.error(error,lang==='ar'));}finally{unlockForm(e.target);}
}

function orderStatusLabel(value){
  const labels={new:['جديد','New'],confirmed:['مؤكد','Confirmed'],processing:['قيد التجهيز','Processing'],shipped:['تم الشحن','Shipped'],completed:['مكتمل','Completed'],cancelled:['ملغي','Cancelled']};
  const pair=labels[value];return pair?txt(pair[0],pair[1]):value;
}
async function loadOrders(){
 const version=++orderLoadVersion,body=A('#ordersBody');
 try{let query=sb.from('store_orders').select('*',{count:'exact'}).order('created_at',{ascending:false}).order('id');
 const term=val('#orderSearch').replace(/[^\p{L}\p{N} @.+-]/gu,'').slice(0,100);
 if(term)query=query.or(`order_number.ilike.%${term}%,customer_name.ilike.%${term}%,phone.ilike.%${term}%`);
 const {data,error,count}=await query.range(orderPage*25,orderPage*25+24);if(error)throw error;if(version!==orderLoadVersion)return;
 orders=data||[];orderCount=count||0;renderOrders();updateMetrics();renderPager('order',orderPage,orderCount);
 }catch(error){if(version!==orderLoadVersion)return;body.innerHTML=`<tr><td colspan="5">${txt('تعذر تحميل الطلبات.','Orders could not load.')} <button onclick="loadOrders()">${txt('إعادة المحاولة','Retry')}</button></td></tr>`;}
}
function renderOrders(){
 const body=A('#ordersBody');if(!body)return;
 body.innerHTML=orders.map(o=>`<tr><td><button class="admin-btn small" onclick="showOrder('${o.id}')">${esc(o.order_number)}</button></td><td>${esc(o.customer_name)}<br><small>${esc(o.phone)}</small></td><td>${adminMoney(o.total,o.currency)}</td><td><select aria-label="${txt('حالة الطلب','Order status')}" onchange="setOrderStatus('${o.id}',this.value)">${[o.status,...({new:['confirmed','cancelled'],confirmed:['processing','cancelled'],processing:['shipped','cancelled'],shipped:['completed']}[o.status]||[])].map(status=>`<option value="${status}">${orderStatusLabel(status)}</option>`).join('')}</select></td><td>${adminDate(o.created_at)}</td></tr>`).join('')||`<tr><td colspan="5">${txt('لا توجد طلبات مطابقة.','No matching orders.')}</td></tr>`;
}
async function setOrderStatus(id,status){
 const o=orders.find(x=>x.id===id);if(!o)return;
 if(status==='cancelled'&&!confirm(txt('إلغاء الطلب وإرجاع الكمية للمخزون؟','Cancel the order and restore its stock?'))){renderOrders();return;}
 try{const {error}=await sb.from('store_orders').update({status}).eq('id',id).eq('updated_at',o.updated_at).select('id').single();if(error)throw error;await Promise.all([loadOrders(),loadProducts()]);}
 catch(error){alert(NadiaStore.error(error,lang==='ar'));await loadOrders();}
}
async function showOrder(id){
 const dialog=A('#orderDetail');dialog.showModal();A('#orderDetailBody').textContent=txt('جاري التحميل…','Loading…');
 try{
  const [orderResult,itemResult]=await Promise.all([sb.from('store_orders').select('*').eq('id',id).single(),sb.from('store_order_items').select('*').eq('order_id',id)]);
  if(orderResult.error)throw orderResult.error;if(itemResult.error)throw itemResult.error;
  const o=orderResult.data;const labels={pending:txt('بانتظار الدفع','Pending'),paid:txt('مدفوع','Paid'),refunded:txt('مسترد','Refunded'),failed:txt('فشل','Failed'),cancelled:txt('ملغي','Cancelled'),processing:txt('قيد المعالجة','Processing')};
  A('#orderDetailBody').innerHTML=`<h2>${esc(o.order_number)}</h2><p>${esc(o.customer_name)} · <bdi>${esc(o.phone)}</bdi><br>${esc(o.email||'')}</p><p>${esc(o.country)} · ${esc(o.governorate)} · ${esc(o.city)}<br>${esc(o.address)}</p><div class="admin-table-wrap"><table class="admin-table-v2"><thead><tr><th>${txt('المنتج','Item')}</th><th>${txt('الكمية','Quantity')}</th><th>${txt('السعر','Price')}</th><th>${txt('المجموع','Amount')}</th></tr></thead><tbody>${itemResult.data.map(i=>`<tr><td>${esc(lang==='ar'?i.product_name_ar:i.product_name_en)}</td><td>${i.quantity}</td><td>${adminMoney(i.unit_price,o.currency)}</td><td>${adminMoney(i.line_total,o.currency)}</td></tr>`).join('')}</tbody></table></div><p>${txt('الشحن','Shipping')}: ${adminMoney(o.shipping_cost,o.currency)}<br><b>${txt('الإجمالي','Total')}: ${adminMoney(o.total,o.currency)}</b></p><p>${txt('رسالة الهدية','Gift message')}: ${esc(o.gift_message||'—')}<br>${txt('ملاحظات','Notes')}: ${esc(o.notes||'—')}</p><p>${txt('الدفع','Payment')}: ${o.payment_method==='cod'?txt('عند الاستلام','Cash on delivery'):txt('بالتنسيق مع المتجر','Arranged with the store')} · ${esc(labels[o.payment_status]||o.payment_status)}</p><label for="orderPayment">${txt('تحديث حالة الدفع بعد التحقق من التحصيل','Update payment after verifying collection')}</label><select id="orderPayment">${['pending','paid','refunded','failed','cancelled'].map(v=>`<option value="${v}" ${o.payment_status===v?'selected':''}>${labels[v]}</option>`).join('')}</select><button class="admin-btn" id="saveOrderPayment">${txt('حفظ حالة الدفع','Save payment status')}</button>`;
  A('#saveOrderPayment').onclick=async function(){this.disabled=true;try{const {error}=await sb.from('store_orders').update({payment_status:A('#orderPayment').value}).eq('id',id).eq('updated_at',o.updated_at).select('id').single();if(error)throw error;await showOrder(id);await loadOrders();}catch(error){alert(txt('تغيّر الطلب أو تعذر الحفظ. افتحه مجددًا.','Order changed or could not save. Reopen it.'));}finally{this.disabled=false;}};
 }catch(error){A('#orderDetailBody').textContent=txt('تعذر تحميل تفاصيل الطلب. أغلق النافذة وأعد المحاولة.','Could not load order details. Close and try again.');}
}
function renderPager(kind,page,count){
 const el=A('#'+kind+'Pager');if(!el)return;el.innerHTML=`<button class="admin-btn" ${page===0?'disabled':''} onclick="changeAdminPage('${kind}',-1)">${txt('السابق','Previous')}</button> <span>${page+1} / ${Math.max(1,Math.ceil(count/25))} · ${count} ${txt('نتيجة','results')}</span> <button class="admin-btn" ${(page+1)*25>=count?'disabled':''} onclick="changeAdminPage('${kind}',1)">${txt('التالي','Next')}</button>`;
}
function changeAdminPage(kind,delta){if(kind==='order'){orderPage=Math.max(0,orderPage+delta);loadOrders();}else{eventPage=Math.max(0,eventPage+delta);loadEvents();}}

const eventTypeLabel=value=>{const labels={wedding:['زفاف','Wedding'],engagement:['خطوبة','Engagement'],private_event:['مناسبة خاصة','Private event'],corporate:['فعالية شركات','Corporate event'],other:['أخرى','Other']};const pair=labels[value];return pair?txt(pair[0],pair[1]):value};
const eventStatusLabel=value=>{const labels={new:['جديد','New'],contacted:['تم التواصل','Contacted'],planning:['قيد التخطيط','Planning'],quoted:['تم تقديم السعر','Quoted'],confirmed:['مؤكد','Confirmed'],completed:['مكتمل','Completed'],cancelled:['ملغي','Cancelled']};const pair=labels[value];return pair?txt(pair[0],pair[1]):value};
async function loadEvents(){
 const version=++eventLoadVersion;
 try{const {data,error,count}=await sb.from('event_requests').select('*',{count:'exact'}).order('created_at',{ascending:false}).order('id').range(eventPage*25,eventPage*25+24);if(error)throw error;if(version!==eventLoadVersion)return;
 events=data||[];eventCount=count||0;renderEvents();updateMetrics();renderPager('event',eventPage,eventCount);
 }catch(error){if(version!==eventLoadVersion)return;A('#eventsBody').innerHTML=`<tr><td colspan="7">${txt('تعذر تحميل طلبات المناسبات.','Event requests could not load.')} <button onclick="loadEvents()">${txt('إعادة المحاولة','Retry')}</button></td></tr>`;}
}
function renderEvents(){
  const body=A('#eventsBody');if(!body)return;
  body.innerHTML=events.map(r=>`<tr><td><b>${esc(r.request_number)}</b></td><td>${esc(r.customer_name)}<br><small>${esc(r.phone)}${r.email?'<br>'+esc(r.email):''}</small></td><td>${esc(eventTypeLabel(r.event_type))}${r.venue?'<br><small>'+esc(r.venue)+'</small>':''}</td><td>${esc(r.event_date)}<br><small>${esc(r.city)}</small></td><td>${r.guest_count??'—'}</td><td><select onchange="setEventStatus('${r.id}',this.value)">${['new','contacted','planning','quoted','confirmed','completed','cancelled'].map(s=>`<option value="${s}" ${r.status===s?'selected':''}>${eventStatusLabel(s)}</option>`).join('')}</select></td><td style="min-width:240px">${esc(r.requirements)}${r.notes?'<br><small>'+esc(r.notes)+'</small>':''}</td></tr>`).join('')||`<tr><td colspan="7">${txt('لا توجد طلبات مناسبات بعد.','No event requests yet.')}</td></tr>`;
}
async function setEventStatus(id,status){
  const {error}=await sb.from('event_requests').update({status,updated_at:new Date().toISOString()}).eq('id',id);
  if(error){alert(NadiaStore.error(error,lang==='ar'));await loadEvents();return;}await loadEvents();
}

document.addEventListener('languagechange',()=>{
  const active=AA('[data-admin-tab].active')[0]?.dataset.adminTab||'dashboard';
  openTab(active,null,{skipLoad:true});
  renderProducts();renderOrders();renderEvents();
});
document.addEventListener('DOMContentLoaded',()=>init().catch(()=>showLogin(txt('تعذر الاتصال. أعد المحاولة.','Connection failed. Please retry.'))));


async function compressImage(file){
 const bitmap=await createImageBitmap(file);
 try{const ratio=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*ratio));canvas.height=Math.max(1,Math.round(bitmap.height*ratio));canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',.84));if(!blob)throw new Error(txt('تعذر تجهيز الصورة.','Could not process image.'));if(blob.size>2*1024*1024)throw new Error(txt('الصورة كبيرة بعد الضغط؛ جرّب صورة أصغر.','Image is still too large; use a smaller image.'));return blob;
 }finally{bitmap.close();}
}
function loadCommerceSettings(){
 setVal('#settingPayment',siteSettings.payment_method||'manual');
 A('#settingCheckout').checked=siteSettings.checkout_enabled===true;A('#settingPolicies').checked=siteSettings.policies_ready===true;
 for(const country of ['EG']){const rate=(siteSettings.shipping_rates||[]).find(r=>r.country===country);A('#ship'+country).checked=!!rate;setVal('#fee'+country,rate?.fee??'');}
 const missing=products.filter(p=>!(Number(p.price)>0&&Number(p.stock)>0&&p.image_url&&p.description_ar&&p.description_en)).length;
 A('#storeReadiness').textContent=txt(`${missing} منتج يحتاج سعرًا أو مخزونًا. أكمل السعر والمخزون والصورة والوصف لكل منتج تبيعه. اعتمد السياسات قبل تفعيل الطلبات.`,` ${missing} products need prices or stock. Add a price, stock, image and descriptions to each product you sell. Approve all policies before enabling orders.`);
}
function readCommerceSettings(){
 const shipping_rates=[];for(const country of ['EG'])if(checked('#ship'+country)){const value=val('#fee'+country);if(!/^\d{1,7}(\.\d{1,2})?$/.test(value))throw new Error(txt('أدخل رسوم شحن صحيحة لكل دولة مفعلة.','Enter a valid shipping fee for each enabled country.'));shipping_rates.push({country,fee:Number(value)});}
 return {shipping_rates,payment_method:val('#settingPayment'),checkout_enabled:checked('#settingCheckout'),policies_ready:checked('#settingPolicies')};
}
function renderPageBlocks(key,values){
 const blocks=window.NADIA_CMS_FIELDS?.[key]||[];
 A('#pageBlocks').innerHTML=blocks.map((b,i)=>{const v=values.find(x=>x.id===b.id)||b;return `<fieldset class="admin-card-v2" data-block-id="${esc(b.id)}"><legend>${esc(b.ar.slice(0,60))}</legend><div class="admin-grid-2"><div class="field"><label for="block-ar-${i}">${txt('العربية','Arabic')}</label><textarea id="block-ar-${i}" data-block-lang="ar">${esc(v.ar)}</textarea></div><div class="field"><label for="block-en-${i}">${txt('الإنجليزية','English')}</label><textarea id="block-en-${i}" data-block-lang="en">${esc(v.en)}</textarea></div></div></fieldset>`;}).join('');
}
function readPageBlocks(){return AA('[data-block-id]').map(el=>({id:el.dataset.blockId,ar:el.querySelector('[data-block-lang=ar]').value,en:el.querySelector('[data-block-lang=en]').value}));}
async function showContentHistory(){
 const key='page_'+val('#pageKey'),box=A('#pageHistory');box.textContent=txt('جاري التحميل…','Loading…');
 try{const {data,error}=await sb.from('content_history').select('id,value,created_at').eq('content_key',key).order('created_at',{ascending:false}).limit(20);if(error)throw error;
 box.replaceChildren();for(const row of data){const btn=document.createElement('button');btn.className='admin-btn';btn.type='button';btn.textContent=txt('استرجاع نسخة ','Restore version ')+adminDate(row.created_at);btn.onclick=async()=>{if(key!=='page_'+val('#pageKey'))return;if(!confirm(txt('استرجاع هذه النسخة؟ سيُحفظ المحتوى الحالي في السجل.','Restore this version? Current content will remain in history.')))return;btn.disabled=true;try{await putContent(key,row.value);await loadPageContent();box.replaceChildren();}catch(error){alert(error.message);}finally{btn.disabled=false;}};box.append(btn);}
 if(!data.length)box.textContent=txt('لا توجد نسخ سابقة بعد.','No previous versions yet.');
 }catch(error){box.textContent=txt('تعذر تحميل السجل.','Could not load history.');}
}
let mfaFactor=null;
async function requireMfa(){
 const {data,error}=await sb.auth.mfa.getAuthenticatorAssuranceLevel();if(error)throw error;
 if(data.nextLevel==='aal2'&&data.currentLevel!=='aal2'){
  const r=await sb.auth.mfa.listFactors();if(r.error)throw r.error;mfaFactor=r.data.totp.find(f=>f.status==='verified')?.id;
  if(!mfaFactor)throw new Error('MFA factor unavailable');A('#mfaQr').hidden=true;A('#mfaSecret').textContent='';A('#mfaDialog').showModal();return false;
 }
 return true;
}
async function enrollMfa(button){
 button.disabled=true;
 try{const existing=await sb.auth.mfa.listFactors();if(existing.error)throw existing.error;
 if(existing.data.totp.some(f=>f.status==='verified'))return alert(txt('التحقق بخطوتين مفعّل لهذا الحساب.','Two-step verification is already enabled.'));
 for(const f of existing.data.all.filter(f=>f.factor_type==='totp'&&f.status==='unverified')){const r=await sb.auth.mfa.unenroll({factorId:f.id});if(r.error)throw r.error;}
 const {data,error}=await sb.auth.mfa.enroll({factorType:'totp',friendlyName:'Nadia Admin'});if(error)throw error;
 mfaFactor=data.id;A('#mfaQr').src=data.totp.qr_code;A('#mfaQr').hidden=false;A('#mfaSecret').textContent=data.totp.secret;A('#mfaDialog').showModal();
 }catch(error){alert(txt('تعذر إعداد التحقق بخطوتين. حاول مجددًا.','Could not set up two-step verification. Try again.'));}finally{button.disabled=false;}
}
async function verifyMfa(e){
 e.preventDefault();const btn=e.target.querySelector('button[type=submit]');btn.disabled=true;
 try{const {error}=await sb.auth.mfa.challengeAndVerify({factorId:mfaFactor,code:val('#mfaCode')});if(error)throw error;A('#mfaDialog').close();A('#mfaCode').value='';A('#mfaSecret').textContent='';A('#mfaQr').removeAttribute('src');await init();}
 catch(error){setStatus('#mfaStatus',txt('الرمز غير صحيح أو انتهت صلاحيته. حاول مجددًا.','Invalid or expired code. Please try again.'),'error');}finally{btn.disabled=false;}
}
async function exportStoreData(button){
 button.disabled=true;setStatus('#backupStatus',txt('جاري تجهيز النسخة…','Preparing export…'));
 try{const backup={format:'nadia-store-export-v1',created_at:new Date().toISOString(),tables:{},media:[]};
 for(const table of ['products','site_content','announcements','store_orders','store_order_items','event_requests','content_history']){const rows=[];for(let offset=0;;offset+=500){const {data,error}=await sb.from(table).select('*').order(table==='site_content'?'key':'id').range(offset,offset+499);if(error)throw error;rows.push(...data);if(data.length<500)break;}backup.tables[table]=rows;}
 async function media(prefix=''){for(let offset=0;;offset+=100){const {data,error}=await sb.storage.from(MEDIA_BUCKET).list(prefix,{limit:100,offset,sortBy:{column:'name',order:'asc'}});if(error)throw error;for(const item of data){const path=prefix?prefix+'/'+item.name:item.name;if(!item.id){await media(path);continue;}const r=await sb.storage.from(MEDIA_BUCKET).download(path);if(r.error)throw r.error;const content=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(r.data);});backup.media.push({path,content});}if(data.length<100)break;}}
 await media();const url=URL.createObjectURL(new Blob([JSON.stringify(backup)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='nadia-store-backup-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);setStatus('#backupStatus',txt('تم تنزيل البيانات والصور المرفوعة. احفظ النسخة في مكان آمن.','Data and uploaded images downloaded. Keep this file somewhere safe.'),'success');
 }catch(error){setStatus('#backupStatus',txt('تعذر تجهيز نسخة كاملة؛ لم يتم تنزيل نسخة ناقصة.','Could not create a complete export; no partial backup was downloaded.'),'error');}finally{button.disabled=false;}
}
document.addEventListener('DOMContentLoaded',()=>{
 let timer;A('#orderSearch')?.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{orderPage=0;loadOrders();},300);});
 document.addEventListener('keydown',e=>{if(e.key==='Escape')closeProductEditor();});
 window.addEventListener('beforeunload',e=>{if(document.querySelector('form[data-saving]')){e.preventDefault();e.returnValue='';}});
});
