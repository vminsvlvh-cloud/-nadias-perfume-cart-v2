
const cfg=window.NADIA_SUPABASE||{};
const sb=(window.supabase&&cfg.url&&cfg.anonKey)?supabase.createClient(cfg.url,cfg.anonKey):null;
let lang=localStorage.getItem('nadia_lang')||'ar';
let cart=JSON.parse(localStorage.getItem('nadia_cart')||'[]');
function t(ar,en){return lang==='ar'?ar:en}
function applyLang(){
 document.documentElement.lang=lang;document.documentElement.dir=lang==='ar'?'rtl':'ltr';
 document.querySelectorAll('[data-ar][data-en]').forEach(el=>el.textContent=el.dataset[lang]);
 renderProducts();renderCart();
}
function setLang(v){lang=v;localStorage.setItem('nadia_lang',v);applyLang()}
async function loadProducts(){
 let rows=[];
 if(sb){const {data,error}=await sb.from('products').select('*').eq('active',true).order('created_at');if(!error&&data?.length)rows=data}
 if(!rows.length)rows=window.NADIA_PRODUCTS.map(x=>({...x,price:null,stock:0,image_url:null}));
 window.NADIA_RUNTIME_PRODUCTS=rows;renderProducts()
}
function renderProducts(){
 const el=document.getElementById('productGrid');if(!el)return;
 const rows=window.NADIA_RUNTIME_PRODUCTS||window.NADIA_PRODUCTS||[];
 el.innerHTML=rows.map(p=>`<article class="card"><div class="placeholder">${(lang==='ar'?p.name_ar:p.name_en).slice(0,1)}</div><h3>${lang==='ar'?p.name_ar:p.name_en}</h3><p>${p.price!=null?p.price+' EGP':t('السعر يضاف من لوحة الإدارة','Price added from admin')}</p><div class="row"><button class="btn gold" onclick="addToCart('${p.slug}')">${t('أضف للسلة','Add to cart')}</button><a class="btn" style="color:#241c17" href="product.html?slug=${p.slug}">${t('التفاصيل','Details')}</a></div></article>`).join('');
}
function addToCart(slug){const f=cart.find(x=>x.slug===slug);if(f)f.qty++;else cart.push({slug,qty:1});localStorage.setItem('nadia_cart',JSON.stringify(cart));renderCart();openCart()}
function renderCart(){document.querySelectorAll('[data-cart-count]').forEach(x=>x.textContent=cart.reduce((a,b)=>a+b.qty,0));const el=document.getElementById('cartItems');if(!el)return;el.innerHTML=cart.length?cart.map(i=>`<div class="cart-item"><span>${i.slug} × ${i.qty}</span><button onclick="removeItem('${i.slug}')">×</button></div>`).join(''):t('السلة فارغة','Cart is empty')}
function removeItem(slug){cart=cart.filter(x=>x.slug!==slug);localStorage.setItem('nadia_cart',JSON.stringify(cart));renderCart()}
function openCart(){document.getElementById('cartDrawer')?.classList.remove('hidden')}function closeCart(){document.getElementById('cartDrawer')?.classList.add('hidden')}
async function loadAnnouncement(){if(!sb)return;const {data}=await sb.from('announcements').select('*').eq('active',true).order('updated_at',{ascending:false}).limit(1).maybeSingle();const el=document.getElementById('announcement');if(el&&data){el.textContent=lang==='ar'?data.text_ar:data.text_en;el.classList.remove('hidden')}}
document.addEventListener('DOMContentLoaded',()=>{applyLang();loadProducts();loadAnnouncement()});
