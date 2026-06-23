import { createRecord, queryRecords, updateRecord, countRecords } from './db.js';

// Legal pages are stored as CmsSection rows keyed by `section_key`; the
// storefront LegalPage reads body / body_ar from these. Seeding here makes the
// Lebanon-specific copy authoritative AND editable from the CMS admin.
//
// Returns terms are EXACT per AURA policy: exchange-only (no cash refunds),
// notify within 24h, 14-day exchange window, the alternative honours the same
// discounts, the customer pays any price difference, governed by Lebanese law.

const LEGAL_PAGES = [
  {
    section_key: 'legal_returns',
    title: 'Returns & Exchanges',
    title_ar: 'الإرجاع والاستبدال',
    body: `## Returns & Exchanges Policy

**Last updated: June 2026**

AURA offers **exchanges only — we do not provide cash refunds.**

### 1. Notify Us Within 24 Hours
You must contact us on WhatsApp within **24 hours** of receiving your order to request an exchange. Requests made after 24 hours cannot be accepted.

### 2. 14-Day Exchange Window
Once your request is approved, the item must reach us within **14 days**. Items must be unworn, unwashed, and returned with their original tags and packaging.

### 3. Choosing an Alternative
- Your replacement item honours the **same discounts** that applied to the original order.
- If the alternative costs more, **you pay the difference.** If it costs less, the remaining balance is issued as store credit — we do not refund cash.

### 4. Final Sale
Sale and clearance items are final and cannot be exchanged unless they are faulty.

### 5. Faulty or Incorrect Items
If an item arrives damaged or incorrect, notify us within 24 hours and we will exchange it at no extra cost.

### 6. Governing Law
This policy, and any dispute arising from it, is governed by the laws of **Lebanon**.
`,
    body_ar: `## سياسة الإرجاع والاستبدال

**آخر تحديث: يونيو 2026**

تقدّم AURA **الاستبدال فقط — لا نقدّم استرداداً نقدياً.**

### 1. أبلغنا خلال 24 ساعة
يجب التواصل معنا عبر واتساب خلال **24 ساعة** من استلام طلبك لطلب الاستبدال. لا يمكن قبول الطلبات بعد مرور 24 ساعة.

### 2. مهلة الاستبدال 14 يوماً
بعد الموافقة على طلبك، يجب أن يصلنا المنتج خلال **14 يوماً**. يجب أن يكون المنتج غير مرتدى وغير مغسول ومع وسومه وتغليفه الأصلي.

### 3. اختيار البديل
- يحصل المنتج البديل على **نفس التخفيضات** التي طُبّقت على الطلب الأصلي.
- إذا كان البديل أغلى، **تدفع الفرق.** وإذا كان أرخص، يُمنح الفرق كرصيد متجر — لا نعيد المبلغ نقداً.

### 4. البيع النهائي
منتجات التخفيضات والتصفية نهائية ولا يمكن استبدالها إلا إذا كانت معيبة.

### 5. المنتجات التالفة أو الخاطئة
إذا وصل المنتج تالفاً أو غير صحيح، أبلغنا خلال 24 ساعة وسنستبدله دون أي تكلفة إضافية.

### 6. القانون الحاكم
تخضع هذه السياسة وأي نزاع ينشأ عنها لقوانين **لبنان**.
`,
  },
  {
    section_key: 'legal_shipping',
    title: 'Shipping Policy',
    title_ar: 'سياسة الشحن',
    body: `## Shipping Policy

**Last updated: June 2026**

### Delivery Areas
We deliver to **all areas across Lebanon.**

### Delivery Fees & Times
- Most orders arrive within **2–5 business days.**
- Delivery fees are calculated at checkout based on your area.
- Orders over **$50** qualify for **free shipping.**

### Order Processing
Orders are processed within 1 business day. You will receive a WhatsApp confirmation once your order is dispatched.

### Cash on Delivery
Payment is collected upon delivery in USD, or the equivalent in LBP at the current exchange rate.
`,
    body_ar: `## سياسة الشحن

**آخر تحديث: يونيو 2026**

### مناطق التوصيل
نوصّل إلى **جميع المناطق في لبنان.**

### الرسوم والمواعيد
- تصل معظم الطلبات خلال **2–5 أيام عمل.**
- تُحتسب رسوم التوصيل عند الدفع حسب منطقتك.
- الطلبات فوق **50 دولاراً** تحصل على **شحن مجاني.**

### معالجة الطلبات
تُعالَج الطلبات خلال يوم عمل واحد. ستتلقى تأكيداً عبر واتساب بمجرد إرسال طلبك.

### الدفع عند الاستلام
يُحصَّل المبلغ عند التسليم بالدولار الأمريكي أو ما يعادله بالليرة اللبنانية حسب سعر الصرف.
`,
  },
  {
    section_key: 'legal_terms',
    title: 'Terms & Conditions',
    title_ar: 'الشروط والأحكام',
    body: `## Terms & Conditions

**Last updated: June 2026**

By using the AURA website you agree to these terms.

### 1. Orders
- All orders are subject to product availability.
- Prices are in USD.
- We reserve the right to cancel orders that cannot be fulfilled.

### 2. Payment
We accept Cash on Delivery.

### 3. Delivery
We deliver across Lebanon. See our Shipping Policy for fees and times.

### 4. Returns & Exchanges
We offer exchanges only (no cash refunds). See our Returns & Exchanges Policy for full details.

### 5. Intellectual Property
All content on this site belongs to AURA and may not be reproduced without permission.

### 6. Governing Law
These terms are governed by the laws of **Lebanon**.
`,
    body_ar: `## الشروط والأحكام

**آخر تحديث: يونيو 2026**

باستخدامك موقع AURA فإنك توافق على هذه الشروط.

### 1. الطلبات
- تخضع جميع الطلبات لتوافر المنتج.
- الأسعار بالدولار الأمريكي.
- نحتفظ بالحق في إلغاء الطلبات التي لا يمكن تنفيذها.

### 2. الدفع
نقبل الدفع عند الاستلام.

### 3. التوصيل
نوصّل إلى كل لبنان. راجع سياسة الشحن لمعرفة الرسوم والمواعيد.

### 4. الإرجاع والاستبدال
نقدّم الاستبدال فقط (دون استرداد نقدي). راجع سياسة الإرجاع والاستبدال للتفاصيل الكاملة.

### 5. الملكية الفكرية
جميع محتويات الموقع ملك لـ AURA ولا يجوز إعادة إنتاجها دون إذن.

### 6. القانون الحاكم
تخضع هذه الشروط لقوانين **لبنان**.
`,
  },
];

function seedLegalPages() {
  for (const page of LEGAL_PAGES) {
    const existing = queryRecords('CmsSection', { query: { section_key: page.section_key }, limit: 1 });
    const data = { ...page, is_active: true, sort_order: 0 };
    if (existing.length) {
      updateRecord('CmsSection', existing[0].id, data);
    } else {
      createRecord('CmsSection', data);
    }
  }
}

const FAQS = [
  {
    category: 'Shipping & Delivery',
    question: 'Where do you deliver?',
    question_ar: 'إلى أين توصّلون؟',
    answer: 'We deliver to all areas across Lebanon. Most orders arrive within 2–5 business days.',
    answer_ar: 'نوصّل إلى جميع المناطق في لبنان. تصل معظم الطلبات خلال 2–5 أيام عمل.',
  },
  {
    category: 'Shipping & Delivery',
    question: 'Is delivery free?',
    question_ar: 'هل التوصيل مجاني؟',
    answer: 'Orders over $50 qualify for free shipping. Below that, a delivery fee is calculated at checkout based on your area.',
    answer_ar: 'الطلبات فوق 50 دولاراً تحصل على شحن مجاني. وأقل من ذلك تُحتسب رسوم التوصيل عند الدفع حسب منطقتك.',
  },
  {
    category: 'Payment',
    question: 'How can I pay?',
    question_ar: 'كيف يمكنني الدفع؟',
    answer: 'We accept Cash on Delivery. You pay in USD, or the equivalent in LBP at the current exchange rate, when your order arrives.',
    answer_ar: 'نقبل الدفع عند الاستلام. تدفع بالدولار الأمريكي أو ما يعادله بالليرة اللبنانية حسب سعر الصرف عند وصول طلبك.',
  },
  {
    category: 'Returns & Exchanges',
    question: 'Can I return an item for a refund?',
    question_ar: 'هل يمكنني إرجاع منتج واسترداد المبلغ؟',
    answer: 'We offer exchanges only — we do not provide cash refunds. Contact us on WhatsApp within 24 hours of delivery to request an exchange.',
    answer_ar: 'نقدّم الاستبدال فقط — لا نقدّم استرداداً نقدياً. تواصل معنا عبر واتساب خلال 24 ساعة من الاستلام لطلب الاستبدال.',
  },
  {
    category: 'Returns & Exchanges',
    question: 'How does an exchange work?',
    question_ar: 'كيف يتم الاستبدال؟',
    answer: 'Notify us within 24 hours, then send the unworn item back within 14 days. Your replacement keeps the same discounts as the original order; if it costs more you pay the difference, if it costs less the balance becomes store credit.',
    answer_ar: 'أبلغنا خلال 24 ساعة، ثم أرسل المنتج غير المرتدى خلال 14 يوماً. يحتفظ البديل بنفس تخفيضات الطلب الأصلي؛ إذا كان أغلى تدفع الفرق، وإذا كان أرخص يصبح الفرق رصيد متجر.',
  },
  {
    category: 'Products & Sizing',
    question: 'How do I choose the right size?',
    question_ar: 'كيف أختار المقاس المناسب؟',
    answer: 'Each product page has a size guide. Our fits run true to size — if you prefer an oversized look, size up. Still unsure? Message us on WhatsApp.',
    answer_ar: 'تحتوي كل صفحة منتج على دليل مقاسات. مقاساتنا مطابقة — إذا كنت تفضل الإطلالة الواسعة اختر مقاساً أكبر. غير متأكد؟ راسلنا على واتساب.',
  },
  {
    category: 'Orders',
    question: 'How do I track my order?',
    question_ar: 'كيف أتتبع طلبي؟',
    answer: 'Use the Track Order page with your order number, or reply to your WhatsApp confirmation and we will update you.',
    answer_ar: 'استخدم صفحة تتبع الطلب برقم طلبك، أو رد على تأكيد واتساب وسنوافيك بالمستجدات.',
  },
];

function seedFaqs() {
  // Only seed when the FAQ table is empty so we never clobber owner edits.
  if (countRecords('Faq') > 0) return;
  FAQS.forEach((f, i) => {
    createRecord('Faq', { ...f, is_active: true, sort_order: i });
  });
}

export function seedStoreContent() {
  seedLegalPages();
  seedFaqs();
}
