/* Shared, dependency-free helpers for storefront and dashboard. */
const NadiaStore = {
  read(key, fallback=null) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; } },
  write(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (_) { return false; } },
  remove(key) { try { localStorage.removeItem(key); } catch (_) {} },
  imageUrl(value) { return /^(https:\/\/|assets\/|[a-zA-Z0-9_-]+\.(jpeg|jpg|png|webp)$)/i.test(String(value||'')); },
  httpsUrl(value) { try { return new URL(value).protocol==='https:'; } catch (_) { return false; } },
  purchasable(p) { return !!p?.id && p.active!==false && Number(p.price)>0 && Number(p.stock)>0; },
  reconcile(cart, products) {
    const clean=[];
    for (const i of cart) {
      const p=products.find(p=>p.slug===i?.slug);
      if (!this.purchasable(p)) continue;
      const qty=Math.min(Number(p.stock),100,Math.max(1,Math.floor(Number(i.qty)||1)));
      const existing=clean.find(x=>x.slug===i.slug);
      if(existing) existing.qty=Math.min(Number(p.stock),100,existing.qty+qty); else clean.push({slug:i.slug,qty});
    }
    return clean;
  },
  requestId(kind, payload) {
    // Store a fingerprint and random token only, never customer form contents.
    const fingerprint=JSON.stringify(payload);
    return crypto.subtle.digest('SHA-256',new TextEncoder().encode(fingerprint)).then(bytes=>{
      const hash=Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
      const key='nadia_pending_'+kind,old=this.read(key);
      if(old?.hash===hash && old?.id) return old.id;
      const id=crypto.randomUUID();this.write(key,{hash,id});return id;
    });
  },
  error(error, ar=true) {
    const message=String(error?.message||error||'');
    const messages={
      INSUFFICIENT_STOCK:['تغيّرت الكمية المتاحة. حدّث السلة وحاول مجددًا.','Stock changed. Refresh your bag and try again.'],
      PRODUCT_UNAVAILABLE:['أحد المنتجات لم يعد متاحًا. راجع السلة.','An item is no longer available. Review your bag.'],
      CHECKOUT_UNAVAILABLE:['الطلبات غير متاحة حاليًا. تواصل معنا عبر واتساب.','Ordering is currently unavailable. Contact us on WhatsApp.'],
      SHIPPING_UNAVAILABLE:['الشحن غير متاح لهذه الوجهة حاليًا.','Shipping is not available to this destination.'],
      CHECKOUT_CHANGED:['تغيّرت الأسعار أو إعدادات التوصيل. راجع الإجمالي ثم أعد التأكيد.','Prices or delivery settings changed. Review the total and confirm again.'],
      RATE_LIMITED:['وصلت لحد الطلبات المؤقت. حاول لاحقًا أو تواصل عبر واتساب.','Submission limit reached. Try later or contact us on WhatsApp.'],
      CONTENT_CHANGED_RELOAD:['تم تعديل المحتوى من جلسة أخرى. أعد تحميله قبل الحفظ.','Content changed in another session. Reload it before saving.'],
      CURRENCY_LOCKED_REPRICE_REQUIRED:['لا يمكن تغيير العملة مع وجود أسعار. يلزم إعادة تسعير المنتجات أولًا.','Currency is locked while products have prices. Repricing is required.'],
      POLICIES_REQUIRED:['أكمل سياسات المتجر باللغتين واعتمدها أولًا.','Complete and approve store policies in both languages first.'],
      PRODUCTS_REQUIRED:['جهّز منتجًا واحدًا على الأقل بسعر ومخزون وصورة ووصف عربي وإنجليزي.','Prepare at least one product with price, stock, image and Arabic and English descriptions.'],
      SHIPPING_REQUIRED:['أضف وجهة شحن ورسومها أولًا.','Add a shipping destination and fee first.'],
      INVALID_EVENT_DATE:['اختر تاريخ مناسبة من اليوم وحتى ثلاث سنوات.','Choose an event date between today and three years ahead.'],
      INVALID_STATUS_TRANSITION:['لا يمكن الانتقال لهذه الحالة. حدّث الطلب واتبع ترتيب التجهيز.','This status change is not allowed. Refresh the order and follow its workflow.']
    };
    for (const [key,pair] of Object.entries(messages)) if(message.includes(key)) return pair[ar?0:1];
    if(/INVALID_|REQUEST_ID_REQUIRED/.test(message)) return ar?'راجع البيانات المطلوبة والكميات ورقم الهاتف.':'Check the required details, quantities and phone number.';
    return ar?'تعذر إكمال العملية. تحقق من الاتصال وحاول مجددًا؛ إعادة الإرسال بنفس البيانات لا تكرر الطلب.':'Could not complete the request. Check your connection and retry; identical submissions do not duplicate the order.';
  }
};
