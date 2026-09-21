const cfg=window.NADIA_SUPABASE||{};const sb=supabase.createClient(cfg.url,cfg.anonKey);let products=[];
const A=s=>document.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
async function init(){const {data:{session}}=await sb.auth.getSession();session?showApp():showLogin()}
async function login(e){e.preventDefault();const f=new FormData(e.target);const {error}=await sb.auth.signInWithPassword({email:f.get('email'),password:f.get('password')});if(error)return A('#loginMsg').textContent=error.message;showApp()}
async function logout(){await sb.auth.signOut();location.reload()}
async function showApp(){A('#login').classList.add('hidden');A('#app').classList.remove('hidden');await loadProducts();await loadOrders();await loadEvents();await loadAnnouncement()}
async function loadProducts(){const {data,error}=await sb.from('products').select('*').order('created_at');if(error)return alert(error.message);products=data||[];A('#productsBody').innerHTML=products.map(p=>`<tr><td>${esc(p.name_ar)}<br><small>${esc(p.name_en)}</small></td><td>${p.price??'—'}</td><td>${p.stock??'—'}</td><td>${p.active?'✓':'—'}</td><td><button onclick="editProduct('${p.id}')">${t('تعديل','Edit')}</button></td></tr>`).join('')}
function newProduct(){A('#productForm').reset();A('#pid').value='';A('#productEditor').classList.remove('hidden')}
function editProduct(id){const p=products.find(x=>x.id===id);if(!p)return;for(const k of ['id','slug','name_ar','name_en','price','stock','image_url','description_ar','description_en']){const el=A(`[name="${k}"]`);if(el)el.value=p[k]??''}A('[name="active"]').checked=!!p.active;A('#productEditor').classList.remove('hidden');scrollTo({top:0,behavior:'smooth'})}
async function saveProduct(e){e.preventDefault();const f=new FormData(e.target),id=f.get('id');const row={slug:f.get('slug').trim(),name_ar:f.get('name_ar').trim(),name_en:f.get('name_en').trim(),price:f.get('price')===''?null:Number(f.get('price')),stock:f.get('stock')===''?null:Number(f.get('stock')),image_url:f.get('image_url').trim()||null,description_ar:f.get('description_ar').trim()||null,description_en:f.get('description_en').trim()||null,active:f.get('active')==='on'};let r=id?await sb.from('products').update(row).eq('id',id):await sb.from('products').insert(row);if(r.error)return alert(r.error.message);A('#productEditor').classList.add('hidden');await loadProducts()}
async function loadOrders(){const {data,error}=await sb.from('store_orders').select('*').order('created_at',{ascending:false}).limit(100);if(error){A('#ordersBody').innerHTML=`<tr><td colspan="5">${t('شغّل SUPABASE_CHECKOUT.sql أولاً.','Run SUPABASE_CHECKOUT.sql first.')}</td></tr>`;return}A('#ordersBody').innerHTML=(data||[]).map(o=>`<tr><td>${esc(o.order_number)}</td><td>${esc(o.customer_name)}<br>${esc(o.phone)}</td><td>${Number(o.total).toLocaleString()} EGP</td><td><select onchange="setStatus('${o.id}',this.value)">${['new','confirmed','preparing','shipped','completed','cancelled'].map(s=>`<option value="${s}" ${o.status===s?'selected':''}>${statusLabel(s)}</option>`).join('')}</select></td><td>${new Date(o.created_at).toLocaleString()}</td></tr>`).join('')}
async function setStatus(id,status){const {error}=await sb.from('store_orders').update({status}).eq('id',id);if(error)alert(error.message)}
async function loadAnnouncement(){const {data}=await sb.from('announcements').select('*').order('updated_at',{ascending:false}).limit(1).maybeSingle();if(data){A('#annId').value=data.id;A('#annAr').value=data.text_ar||'';A('#annEn').value=data.text_en||'';A('#annActive').checked=!!data.active}}
async function saveAnnouncement(e){e.preventDefault();const id=A('#annId').value,row={text_ar:A('#annAr').value,text_en:A('#annEn').value,active:A('#annActive').checked};const r=id?await sb.from('announcements').update(row).eq('id',id):await sb.from('announcements').insert(row);if(r.error)alert(r.error.message);else alert(t('تم الحفظ','Saved'))}
document.addEventListener('DOMContentLoaded',init);

async function loadEvents(){
  const {data,error}=await sb.from('event_requests').select('*').order('created_at',{ascending:false}).limit(100);
  const body=A('#eventsBody'); if(!body)return;
  if(error){body.innerHTML=`<tr><td colspan="7">${t('شغّل SUPABASE_EVENT_CART.sql أولاً.','Run SUPABASE_EVENT_CART.sql first.')}</td></tr>`;return}
  body.innerHTML=(data||[]).map(r=>`<tr>
    <td>${esc(r.request_number)}</td>
    <td>${esc(r.customer_name)}<br><small>${esc(r.phone)}${r.email?'<br>'+esc(r.email):''}</small></td>
    <td>${esc(r.event_type)}${r.venue?'<br><small>'+esc(r.venue)+'</small>':''}</td>
    <td>${esc(r.event_date)}<br><small>${esc(r.city)}</small></td>
    <td>${r.guest_count??'—'}</td>
    <td><select onchange="setEventStatus('${r.id}',this.value)">${['new','contacted','planning','quoted','confirmed','completed','cancelled'].map(s=>`<option value="${s}" ${r.status===s?'selected':''}>${statusLabel(s)}</option>`).join('')}</select></td>
    <td style="min-width:220px">${esc(r.requirements)}${r.notes?'<br><small>'+esc(r.notes)+'</small>':''}</td>
  </tr>`).join('');
}
async function setEventStatus(id,status){const {error}=await sb.from('event_requests').update({status}).eq('id',id);if(error)alert(error.message)}


function statusLabel(value){const labels={new:'جديد',confirmed:'مؤكد',preparing:'قيد التجهيز',shipped:'تم الشحن',completed:'مكتمل',cancelled:'ملغي',contacted:'تم التواصل',planning:'قيد التخطيط',quoted:'تم تقديم السعر'};return t(labels[value]||value,value)}
document.addEventListener('languagechange',()=>{
 document.querySelectorAll('#ordersBody option,#eventsBody option').forEach(el=>el.textContent=statusLabel(el.value));
 document.querySelectorAll('#productsBody button').forEach(el=>el.textContent=t('تعديل','Edit'));
});
