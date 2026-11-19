/* SNS mobile wholesale – mounted inside the authenticated SNS workspace. */
(function () {
  'use strict';

  const labels = {
    inventory: 'المخزون', catalog: 'الكتالوج', suppliers: 'الموردون',
    purchase: 'شراء جديد', invoices: 'فواتير الشراء', opening: 'أرصدة افتتاحية', settings: 'الإعدادات'
  };
  const states = {
    available: 'متاح', reserved: 'محجوز', sold: 'مباع', maintenance: 'في الصيانة',
    damaged: 'تالف', supplier_return: 'مرتجع للمورد', voided: 'ملغى'
  };
  const conditions = {sealed:'مغلق',open_box:'علبة مفتوحة',used:'مستعمل',refurbished:'مجدّد'};
  const categories = {phone:'موبايل',tablet:'تابلت',watch:'ساعة',accessory:'إكسسوار',other:'أخرى'};
  const accountKinds = {cash:'نقدي',bank:'بنك',transfer:'تحويل',instapay:'إنستاباي',vodafone:'فودافون كاش'};
  const escape = value => String(value ?? '').replace(/[&<>"']/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
  const amount = value => value == null ? '—' : new Intl.NumberFormat('ar-EG',{maximumFractionDigits:2}).format(value);
  const cell = value => escape(value ?? '—');
  const skuTitle = sku => [sku?.model,sku?.capacity,sku?.color,sku?.code].filter(Boolean).join(' ');
  const required = (value,name) => {
    if (!value) throw new Error('حدد '+name+'.');
    return value;
  };

  function numeric(input, name, {scale=2,min=0,max=1e12,optional=false}={}) {
    const value = String(input ?? '').trim().replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c))
      .replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace('٫','.');
    if (!value && optional) return undefined;
    const pattern = scale ? new RegExp('^-?[0-9]+(?:[.][0-9]{1,'+scale+'})?$') : /^-?[0-9]+$/;
    if (!pattern.test(value) || Number(value)<min || Number(value)>max || !Number.isFinite(Number(value))) {
      throw new Error('راجع قيمة '+name+'.');
    }
    return value;
  }

  function validImei(value) {
    return /^[0-9]{15}$/.test(value) && value!=='000000000000000' && [...value].reduce((sum,digit,index)=>{
      const doubled=Number(digit)*(index%2 ? 2 : 1);
      return sum+(doubled>9 ? doubled-9 : doubled);
    },0)%10===0;
  }

  function readCsv(input) {
    const text=input.replace(/^\uFEFF/,'').replace(/\r\n?/g,'\n').trim();
    if (!text) throw new Error('أضف صفوف الاستيراد.');
    const separator=text.split('\n',1)[0].includes('\t')?'\t':',';
    const rows=[];
    let row=[], field='', quoted=false, closed=false;
    for (let i=0;i<=text.length;i++) {
      const c=text[i]??'\n';
      if (quoted) {
        if (c!=='"') field+=c;
        else if (text[i+1]==='"') { field+='"'; i++; }
        else { quoted=false; closed=true; }
      } else if (c===separator || c==='\n') {
        row.push(field.trim()); field=''; closed=false;
        if (c==='\n') { if (row.some(Boolean)) rows.push(row); row=[]; }
      } else if (c==='"' && !field && !closed) quoted=true;
      else if (c==='"' || closed) throw new Error('راجع علامات الاقتباس في الملف.');
      else field+=c;
    }
    if (quoted || rows.length<2) throw new Error('مطلوب عناوين الأعمدة وصف بيانات على الأقل.');
    const headers=rows.shift();
    if (headers.includes('') || new Set(headers).size!==headers.length) throw new Error('راجع عناوين الأعمدة.');
    return rows.map((r,i)=>{
      if (r.length!==headers.length) throw new Error('عدد الأعمدة غير صحيح في سطر البيانات '+(i+1)+'.');
      return Object.fromEntries(headers.map((key,j)=>[key,r[j]]));
    });
  }

  const optionList = values => Object.entries(values);
  const input = (name,label,value='',attrs='') =>
    '<label>'+escape(label)+'<input name="'+escape(name)+'" value="'+escape(value)+'" '+attrs+'></label>';
  const area = (name,label,value='') =>
    '<label class="mw-wide">'+escape(label)+'<textarea name="'+escape(name)+'">'+escape(value)+'</textarea></label>';
  const select = (name,label,options,selected='',placeholder='اختار') =>
    '<label>'+escape(label)+'<select name="'+escape(name)+'">'+(placeholder===null?'':'<option value="">'+escape(placeholder)+'</option>')+
    options.map(([key,title])=>'<option value="'+escape(key)+'"'+(String(key)===String(selected)?' selected':'')+'>'+escape(title)+'</option>').join('')+'</select></label>';
  const button = (action,text,id='') => '<button class="btn btn-ghost" type="button" data-mw-action="'+escape(action)+'" data-id="'+escape(id)+'">'+escape(text)+'</button>';
  const form = (action,fields,label) =>
    '<form data-mw-form="'+action+'" class="mw-grid">'+fields+'<div class="mw-wide"><button class="btn btn-primary">'+label+'</button></div></form>';
  const panel = (title,html) => '<section class="panel mw-panel"><h3>'+escape(title)+'</h3>'+html+'</section>';
  const table = (columns,rows) => rows.length ?
    '<div class="mw-scroll"><table><thead><tr>'+columns.map(x=>'<th scope="col">'+escape(x)+'</th>').join('')+'</tr></thead><tbody>'+
    rows.map(row=>'<tr>'+row.map(x=>'<td>'+x+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>' :
    '<p class="mw-muted">مفيش سجلات للعرض.</p>';
  const data = element => Object.fromEntries([...new FormData(element)].map(([key,value])=>[key,String(value).trim()]));
  const filters = element => Object.fromEntries(Object.entries(data(element)).filter(([,value])=>value!==''));
  const upload = '<label class="mw-wide">ملف CSV<input type="file" data-mw-csv accept=".csv,.tsv,text/csv,text/tab-separated-values"></label>';

  async function mount(container, context) {
    const state={info:null,source:{},tab:'inventory',items:[],payments:[],opening:null,edit:null,busy:false,filters:{}};
    const root=document.createElement('div');
    root.className='mw-workspace';
    root.dir='rtl';
    root.innerHTML='<div class="mw-message" role="status" aria-live="polite"></div><nav aria-label="جملة الموبايلات"></nav><div class="mw-page"></div><div class="mw-detail" hidden></div>';
    container.replaceChildren(root);
    const section=root.querySelector('.mw-page'), notice=root.querySelector('.mw-message'), nav=root.querySelector('nav');
    const detail=root.querySelector('.mw-detail');
    const connected=()=>root.isConnected && context.current();
    const finance=()=>['owner','accountant'].includes(state.info?.role);
    const owner=()=>state.info?.role==='owner';
    const editable=()=>finance() || state.info?.role==='stockkeeper';
    const lookup=(name,id)=>(state.source[name]??[]).find(row=>row.id===id);
    const active=name=>(state.source[name]??[]).filter(row=>row.active!==false);
    const options=(name,get=row=>row.name)=>active(name).map(row=>[row.id,get(row)]);
    const soleWarehouse=()=>active('warehouses').length===1?active('warehouses')[0].id:'';
    const warehouse=(selected=soleWarehouse(),blank='اختار المخزن')=>select('warehouse_id','المخزن',options('warehouses'),selected,blank);
    const date=()=>input('date','تاريخ الحركة',state.info.business_date,'type="date" max="'+escape(state.info.business_date)+'" required');

    function announce(message,error=false) {
      notice.textContent=message;
      notice.classList.toggle('mw-error',error);
    }
    async function run(task) {
      if (state.busy || !connected()) return;
      state.busy=true;
      root.inert=true;
      announce('');
      try { await task(); }
      catch(error) { if(connected()) announce(error?.message || 'حصل خطأ في الاتصال.',true); }
      finally { state.busy=false; root.inert=false; }
    }
    async function rpc(name,args={}) {
      if (!connected()) throw new Error('اتغير المحل. افتح جملة الموبايلات من جديد.');
      const {data:result,error}=await context.client.rpc('sns_wholesale_'+name,{p_org:context.org,...args});
      if (error) throw new Error(error.code==='PGRST202' || error.code==='42883'
        ? 'نشاط الجملة محتاج تثبيت ملف قاعدة البيانات على مشروع Supabase المتصل بـSNS.' : error.message);
      return result;
    }
    function read(resource,filter={},limit=50,after=null) {
      return rpc('read',{p_resource:resource,p_filter:filter,p_limit:limit,p_after:after});
    }
    async function all(resource,filter={}) {
      const rows=[];
      for (let cursor=null;;) {
        const batch=await read(resource,filter,500,cursor);
        rows.push(...batch);
        if (batch.length<500) return rows;
        cursor=batch.at(-1).id;
      }
    }
    async function lookups(kind) {
      const rows=[];
      for (;;) {
        const part=await read('lookups',{kind,after_id:rows.length},500);
        rows.push(...part);
        if (part.length<500) return rows;
      }
    }
    async function loadSources() {
      const tasks=[
        ['warehouses',all('warehouses')],['catalog',all('catalog')],
        ['brands',lookups('brand')],['regions',lookups('region')]
      ];
      if (finance()) tasks.push(['suppliers',all('parties',{kind:'supplier'})],
        ['customers',all('parties',{kind:'customer'})],['accounts',all('accounts')]);
      state.source=Object.fromEntries(await Promise.all(tasks.map(async ([key,result])=>[key,await result])));
    }
    async function command(operation, payload) {
      const bytes=new TextEncoder().encode(JSON.stringify([context.org,context.user,operation,payload]));
      const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
      const requestKey='sns.mw.'+[...digest].map(x=>x.toString(16).padStart(2,'0')).join('');
      const requestId=sessionStorage.getItem(requestKey) || crypto.randomUUID();
      sessionStorage.setItem(requestKey,requestId);
      const result=await rpc('command',{p_operation:operation,p_data:payload,p_request_id:requestId});
      sessionStorage.removeItem(requestKey);
      return result;
    }
    function tabs() {
      return ['inventory','catalog',...(finance()?['suppliers','purchase','invoices','opening']:[]),...(owner()?['settings']:[])];
    }
    function show(title,html) {
      detail.hidden=false;
      detail.innerHTML=panel(title,html+button('close','إغلاق التفاصيل'));
      detail.scrollIntoView?.({block:'nearest'});
      detail.querySelector('button')?.focus();
    }
    function refreshTab(name) {
      state.tab=tabs().includes(name)?name:'inventory';
      state.filters={};
      state.opening=null;
      detail.hidden=true; detail.replaceChildren();
      nav.innerHTML=tabs().map(tab=>'<button type="button" class="btn '+(tab===state.tab?'btn-primary':'btn-ghost')+
        '" data-mw-action="tab" data-id="'+tab+'"'+(tab===state.tab?' aria-current="page"':'')+'>'+labels[tab]+'</button>').join('');
      const views={inventory,catalog,suppliers,purchase,invoices,opening,settings};
      return views[state.tab]();
    }
    async function start() {
      state.info=await rpc('status');
      if (!state.info.enabled) {
        nav.replaceChildren();
        section.innerHTML=panel('جملة الموبايلات',owner()?
          '<p>التفعيل يجهّز كتالوج ومخزون الجملة للمحل الحالي.</p>'+button('enable','تفعيل النشاط لهذا المحل'):
          '<p>مالك المحل يقدر يفعّل النشاط من حسابه.</p>');
        return;
      }
      await loadSources();
      await refreshTab('inventory');
    }

    function catalog() {
      const row=state.edit??{};
      const editor=editable()?panel(row.id?'تعديل الصنف':'صنف جديد',form('sku',
        input('code','كود الصنف',row.code,'required maxlength="80"')+
        select('brand','الماركة',active('brands').map(x=>[x.code,x.label]),row.brand)+
        input('model','الموديل',row.model,'required maxlength="160"')+
        select('kind','النوع',[['device','جهاز بالـIMEI'],['accessory','إكسسوار بالكمية']],row.kind??'device',null)+
        select('category','التصنيف',optionList(categories),row.category??'phone',null)+
        input('capacity','السعة',row.capacity)+input('color','اللون',row.color)+input('barcode','الباركود',row.barcode)+
        input('low_stock','الحد الأدنى',row.low_stock??0,'inputmode="numeric"')+
        select('active','الحالة',[['true','نشط'],['false','موقوف']],String(row.active!==false),null),'حفظ الصنف')+
        (row.id?button('cancelEdit','إلغاء التعديل'):'')):'';
      section.innerHTML=editor+panel('الأصناف',form('catalogSearch',input('q','الموديل أو الكود'),'بحث')+'<div data-mw-list></div>');
      return list('catalog');
    }
    function suppliers() {
      const row=state.edit??{};
      section.innerHTML=panel(row.id?'تعديل مورد':'مورد جديد',form('party',
        input('name','اسم المورد',row.name,'required')+input('phone','التليفون',row.phone)+input('address','العنوان',row.address)+
        input('tax_number','الرقم الضريبي',row.tax_number)+select('currency','عملة الحساب',[['EGP','جنيه'],['USD','دولار']],row.currency??'EGP',null)+
        input('credit_limit','حد الائتمان',row.credit_limit,'inputmode="decimal"')+
        select('active','الحالة',[['true','نشط'],['false','موقوف']],String(row.active!==false),null)+area('notes','ملاحظات',row.notes),'حفظ المورد')+
        (row.id?button('cancelEdit','إلغاء التعديل'):''))+
        panel('الموردون',form('supplierSearch',input('q','الاسم أو التليفون'),'بحث')+'<div data-mw-list></div>');
      return list('suppliers');
    }
    function settings() {
      const settings=state.info.settings, profile=settings.profile??{};
      section.innerHTML=panel('بيانات النشاط',form('settings',
        input('name','الاسم التجاري',profile.name)+input('phone','التليفون',profile.phone)+input('address','العنوان',profile.address)+
        input('tax_number','الرقم الضريبي',profile.tax_number)+input('logo','رابط الشعار',profile.logo,'type="url"')+
        input('invoice_prefix','بادئة الفاتورة',settings.invoice_prefix,'required maxlength="10"')+
        input('default_fx','سعر الدولار الافتراضي',settings.default_fx,'inputmode="decimal"')+
        input('vat_rate','نسبة الضريبة',settings.vat_rate,'inputmode="decimal"')+
        input('return_days','مدة الاسترجاع بالأيام',settings.return_days,'inputmode="numeric"')+
        area('invoice_text','نص الفاتورة',profile.invoice_text)+area('warranty','الضمان',profile.warranty)+
        area('return_policy','سياسة الاسترجاع',profile.return_policy),'حفظ الإعدادات'))+
        panel('مخزن جديد',form('warehouse',input('name','اسم المخزن','','required'),'حفظ المخزن'))+
        panel('حساب دفع جديد',form('account',input('name','اسم الحساب','','required')+
          select('kind','نوع الحساب',optionList(accountKinds),'cash',null),'حفظ الحساب'))+
        panel('الماركات والنسخ الإقليمية',form('lookup',select('kind','القائمة',[['brand','ماركة'],['region','نسخة إقليمية']],'brand',null)+
          input('code','الكود','','required')+input('label','الاسم','','required'),'حفظ الكود'));
    }
    function itemFields() {
      return select('sku_id','الصنف',options('catalog',skuTitle))+
        input('imei','IMEI الأساسي','','dir="ltr" inputmode="numeric" maxlength="15"')+
        input('imei2','IMEI الثاني','','dir="ltr" inputmode="numeric" maxlength="15"')+
        input('qty','كمية الإكسسوار','1','inputmode="numeric"')+input('serial_number','الرقم التسلسلي')+
        select('condition','حالة الجهاز',optionList(conditions),'sealed',null)+
        select('grade','الدرجة',[['A','A'],['B','B'],['C','C']],'','حسب الحالة')+
        input('battery','البطارية %','','inputmode="numeric"')+
        select('region','النسخة الإقليمية',active('regions').map(x=>[x.code,x.label]),'','غير محددة')+
        select('sim','نوع الشريحة',[['physical','فعلية'],['esim','eSIM'],['dual_physical','فعلية مزدوجة'],['physical_esim','فعلية وeSIM']],'','غير محدد')+
        select('activation_lock','قفل التفعيل',[['unknown','غير معروف'],['clear','مفتوح'],['locked','مقفل']],'unknown',null)+
        select('mdm','قفل الإدارة MDM',[['unknown','غير معروف'],['clear','مفتوح'],['locked','مقفل']],'unknown',null)+
        select('warranty_kind','الضمان',[['none','بدون'],['agent','وكيل'],['dealer','تاجر']],'none',null)+
        input('warranty_until','انتهاء ضمان الوكيل','','type="date"')+input('warranty_days','عدد أيام ضمان التاجر','','inputmode="numeric"');
    }
    function item(row) {
      const sku=required(active('catalog').find(x=>x.id===row.sku_id||x.code===row.sku_code),'صنف موجود ونشط');
      if (sku.kind==='accessory') {
        if (row.imei||row.imei2) throw new Error('الإكسسوار بيتسجل بالكمية.');
        return {sku_id:sku.id,qty:Number(numeric(row.qty||1,'الكمية',{scale:0,min:1,max:1000000}))};
      }
      if (!validImei(row.imei) || (row.imei2&&!validImei(row.imei2))) throw new Error('راجع رقم IMEI. مطلوب ١٥ رقمًا صحيحًا.');
      if (row.qty && Number(row.qty)!==1) throw new Error('كل IMEI في صف مستقل.');
      const condition=row.condition||'sealed';
      if (!Object.hasOwn(conditions,condition)) throw new Error('راجع حالة الجهاز.');
      if ((condition==='used'&&!row.grade)||(row.grade&&!['A','B','C'].includes(row.grade))) throw new Error('راجع درجة الجهاز المستعمل.');
      if (row.region&&!active('regions').some(x=>x.code===row.region)) throw new Error('النسخة الإقليمية غير مسجلة.');
      const warranty_kind=row.warranty_kind||'none';
      if (!['none','agent','dealer'].includes(warranty_kind)) throw new Error('راجع نوع الضمان.');
      const extras=['imei2','serial_number','grade','region','sim','package','activation_lock','mdm','notes'];
      return {sku_id:sku.id,imei:row.imei,condition,warranty_kind,
        battery:numeric(row.battery,'البطارية',{scale:0,max:100,optional:true}),
        warranty_until:warranty_kind==='agent'?required(row.warranty_until,'تاريخ نهاية الضمان'):undefined,
        warranty_days:warranty_kind==='dealer'?numeric(row.warranty_days,'مدة الضمان',{scale:0,max:3650}):undefined,
        ...Object.fromEntries(extras.filter(key=>row[key]).map(key=>[key,row[key]]))};
    }
    function batch(rows) {
      if (!rows.length || rows.length>1000) throw new Error('الدفعة تقبل من بند واحد إلى ١٠٠٠ بند.');
      const imeis=rows.flatMap(row=>[row.imei,row.imei2].filter(Boolean));
      if (new Set(imeis).size!==imeis.length) throw new Error('رقم IMEI مكرر في الدفعة.');
      return rows;
    }
    function parsed(text,convert) {
      return batch(readCsv(text).map((row,i)=>{
        try { return convert(row); }
        catch(error) { throw new Error('سطر البيانات '+(i+1)+' — '+error.message); }
      }));
    }
    function purchase() {
      section.innerHTML=panel('بنود الشراء',form('item',itemFields()+input('unit_price','سعر الوحدة','','inputmode="decimal"')+
        area('imeis','أو قائمة IMEI لنفس الصنف والسعر'),'إضافة البند')+
        '<details><summary>استيراد بنود CSV أو Excel</summary><p>أعمدة الأجهزة: sku_code,imei,unit_price. الإكسسوارات: sku_code,qty,unit_price.</p>'+
        form('purchaseCsv',upload+area('csv','بيانات البنود'),'إضافة إلى المسودة')+'</details><div data-mw-basket></div>')+
        panel('دفعات المورد',form('payment',select('account_id','حساب الدفع',options('accounts'))+
          input('amount','المبلغ بعملة المورد','','inputmode="decimal"')+input('reference','مرجع الدفعة'),'إضافة دفعة')+
          '<div data-mw-payments></div>')+
        panel('اعتماد الفاتورة',form('purchase',select('party_id','المورد',options('suppliers',x=>x.name+' · '+x.currency))+
          warehouse()+date()+input('reference','رقم فاتورة المورد','','required')+
          input('fx','سعر صرف الدولار',state.info.settings.default_fx,'inputmode="decimal"')+
          input('fees','مصاريف الشراء','0','inputmode="decimal"')+input('discount','الخصم','0','inputmode="decimal"')+
          input('vat_rate','نسبة الضريبة',state.info.settings.vat_rate,'inputmode="decimal"')+area('note','ملاحظات'),'اعتماد فاتورة الشراء'));
      drawDraft();
    }
    function drawDraft() {
      section.querySelector('[data-mw-basket]').innerHTML=table(['الصنف','IMEI','الكمية','السعر','الإجراء'],
        state.items.map((x,i)=>[cell(skuTitle(lookup('catalog',x.sku_id))),cell(x.imei),cell(x.qty??1),cell(amount(x.unit_price)),button('dropItem','حذف',i)]));
      section.querySelector('[data-mw-payments]').innerHTML=table(['الحساب','المبلغ','الإجراء'],
        state.payments.map((x,i)=>[cell(lookup('accounts',x.account_id)?.name),cell(amount(x.amount)),button('dropPayment','حذف',i)]));
    }
    function invoices() {
      section.innerHTML=panel('فواتير الشراء',form('invoiceSearch',input('q','رقم الفاتورة')+
        select('party_id','المورد',options('suppliers'),'','الكل'),'بحث')+'<div data-mw-list></div>');
      return list('invoices');
    }
    function inventory() {
      section.innerHTML=panel('الأجهزة',form('deviceSearch',input('q','IMEI كامل أو بداية اسم الموديل')+warehouse('','كل المخازن')+
        select('status','الحالة',optionList(states),'','الكل')+input('capacity','السعة')+input('color','اللون')+
        (finance()?select('party_id','المورد',options('suppliers'),'','الكل'):''),'بحث')+'<div data-mw-device-list></div>')+
        panel('الإكسسوارات',form('accessorySearch',input('q','اسم الصنف')+warehouse('','كل المخازن'),'بحث')+'<div data-mw-accessory-list></div>');
      return Promise.all([list('devices'),list('accessories')]);
    }
    async function list(kind,cursor='') {
      const filter={...state.filters[kind]};
      const source={catalog:'catalog',suppliers:'parties',invoices:'documents',devices:'devices',accessories:'accessories'};
      if (kind==='suppliers') filter.kind='supplier';
      if (kind==='invoices') filter.kind='purchase';
      const [after,afterWarehouse]=cursor.split('/');
      if (afterWarehouse) filter.after_warehouse=afterWarehouse;
      const page=await read(source[kind],filter,50,after||null);
      const maps={
        catalog:[['الكود','الصنف','الحالة',...(editable()?['تعديل']:[])],x=>[cell(x.code),cell(skuTitle(x)),cell(x.active?'نشط':'موقوف'),...(editable()?[button('editSku','تعديل',x.id)]:[])]],
        suppliers:[['المورد','التليفون','الرصيد','المعرّف','تعديل'],x=>[cell(x.name),cell(x.phone),cell(amount(x.balance)+' '+x.currency),cell(x.id),button('editSupplier','تعديل',x.id)]],
        invoices:[['الفاتورة','مرجع المورد','التاريخ','المورد','الإجمالي','التفاصيل'],x=>[cell(x.number),cell(x.reference),cell(x.business_date),cell(lookup('suppliers',x.party_id)?.name),cell(amount(x.total)+' '+x.currency),button('invoice','عرض',x.id)]],
        devices:[['الجهاز','IMEI','الحالة','المخزن',...(finance()?['التكلفة ج.م']:[]),'التفاصيل'],x=>[cell(skuTitle(x)),cell(x.imei),cell(states[x.status]||x.status),cell(lookup('warehouses',x.warehouse_id)?.name),...(finance()?[cell(amount(x.cost_egp))]:[]),button('device','عرض',x.id)]],
        accessories:[['الصنف','المخزن','الكمية','الحد الأدنى',...(finance()?['متوسط التكلفة']:[])],x=>[cell(x.model),cell(lookup('warehouses',x.warehouse_id)?.name),cell(x.qty),cell(x.low_stock),...(finance()?[cell(amount(x.average_egp))]:[])]]
      };
      const [columns,row]=maps[kind], last=page.at(-1);
      const target=kind==='devices'?'[data-mw-device-list]':kind==='accessories'?'[data-mw-accessory-list]':'[data-mw-list]';
      const next=kind==='accessories'&&last?last.sku_id+'/'+last.warehouse_id:last?.id;
      section.querySelector(target).innerHTML=table(columns,page.map(row))+(page.length===50?button('next:'+kind,'الصفحة التالية',next):'');
    }
    async function invoice(id) {
      const [doc]=await read('documents',{document_id:id,kind:'purchase'},1);
      if (!doc) throw new Error('الفاتورة غير متاحة.');
      const lines=[];
      for (let after=0;;) {
        const part=await read('lines',{document_id:id,after_id:after},500);
        lines.push(...part);
        if (part.length<500) break;
        after=part.at(-1).position;
      }
      show('فاتورة '+doc.number,'<p>'+escape(doc.business_date)+' · '+escape(amount(doc.total)+' '+doc.currency)+(doc.voided_by?' · ملغاة':'')+'</p>'+
        table(['الصنف','IMEI','الكمية','صافي البند','التكلفة بالجنيه'],lines.map(x=>[cell(x.model),cell(x.imei),cell(x.qty),cell(amount(x.line_net)),cell(amount(x.cost_egp))])));
    }
    async function device(id,after=null) {
      const [[row],timeline]=await Promise.all([read('devices',{device_id:id},1),read('timeline',{device_id:id,after_id:after})]);
      if (!row) throw new Error('الجهاز غير متاح.');
      show(skuTitle(row),table(['البيان','القيمة'],[
        ['IMEI',row.imei],['IMEI الثاني',row.imei2],['الحالة',states[row.status]],['حالة الجهاز',conditions[row.condition]],
        ['الدرجة',row.grade],['البطارية %',row.battery],['النسخة الإقليمية',row.region],
        ['انتهاء الضمان',row.warranty_until],...(finance()?[['التكلفة ج.م',amount(row.cost_egp)]]:[])
      ].map(pair=>pair.map(cell)))+'<h4>حركة الجهاز</h4>'+
        table(['التاريخ','المستند','الحالة بعد الحركة'],timeline.map(x=>[cell(x.business_date),cell(x.number),cell(states[x.to_status]||x.to_status)]))+
        (timeline.length===50?button('moreDevice','حركات أقدم',id+'/'+timeline.at(-1).id):''));
    }
    function opening() {
      const parties=[...active('suppliers'),...active('customers')];
      section.innerHTML=panel('رصيد افتتاحي',form('opening',date()+
        select('type','نوع الرصيد',[['stock','مخزون'],['party','عميل أو مورد'],['account','حساب دفع']],'stock',null)+
        warehouse()+select('party_id','العميل أو المورد',parties.map(x=>[x.id,x.name+' · '+x.currency]))+
        select('account_id','حساب الدفع',options('accounts'))+itemFields()+
        input('amount','الرصيد أو إجمالي تكلفة بند المخزون','','inputmode="decimal"')+
        input('fx','سعر صرف الدولار',state.info.settings.default_fx,'inputmode="decimal"'),'معاينة الرصيد'))+
        panel('استيراد أرصدة افتتاحية','<p>للمخزون: <code>type,sku_code,imei,qty,amount</code>. للأرصدة المالية: <code>type,party_id,account_id,amount,fx</code>. نوع الرصيد: stock أو party أو account.</p>'+
          form('openingCsv',date()+warehouse()+upload+area('csv','الصق CSV أو خلايا Excel'),'معاينة الدفعة'));
    }
    function openingRow(x) {
      const type=x.type, total=numeric(x.amount,'الرصيد',{min:type==='stock'?0:-1e12});
      if (type==='stock') {
        required(active('warehouses').find(w=>w.id===x.warehouse_id),'مخزن نشط');
        return {type,amount:total,warehouse_id:x.warehouse_id,...item(x)};
      }
      if (type==='party') {
        const party=required([...active('suppliers'),...active('customers')].find(p=>p.id===x.party_id),'عميل أو مورد موجود');
        return {type,amount:total,party_id:party.id,fx:party.currency==='USD'?
          numeric(x.fx||state.info.settings.default_fx,'سعر الصرف',{scale:6,min:0.000001}):undefined};
      }
      if (type==='account'&&active('accounts').some(a=>a.id===x.account_id)) return {type,amount:total,account_id:x.account_id};
      throw new Error('نوع الرصيد أو حساب الدفع غير صحيح.');
    }
    function previewOpening(day,rows) {
      state.opening={date:day,rows:batch(rows)};
      show('مراجعة الأرصدة قبل الاعتماد',table(['النوع','الصنف أو الحساب','IMEI','الكمية','القيمة'],rows.map(x=>[
        cell(({stock:'مخزون',party:'عميل أو مورد',account:'حساب دفع'})[x.type]),
        cell(skuTitle(lookup('catalog',x.sku_id))||lookup('accounts',x.account_id)?.name||lookup('suppliers',x.party_id)?.name||lookup('customers',x.party_id)?.name),
        cell(x.imei),cell(x.qty??(x.imei?1:null)),cell(amount(x.amount))
      ]))+button('commitOpening','اعتماد الأرصدة'));
    }
    async function submit(event) {
      const target=event.target.closest('[data-mw-form]');
      if (!target) return;
      event.preventDefault();
      const x=data(target);
      await run(async()=>{
        const op=target.dataset.mwForm;
        const search={catalogSearch:'catalog',supplierSearch:'suppliers',invoiceSearch:'invoices',deviceSearch:'devices',accessorySearch:'accessories'};
        if (search[op]) {
          state.filters[search[op]]=filters(target);
          return list(search[op]);
        }
        switch(op) {
          case 'sku':
            await command('sku',{...x,id:state.edit?.id,low_stock:numeric(x.low_stock||0,'الحد الأدنى',{scale:0,max:1000000})});
            break;
          case 'party':
            await command('party',{...x,kind:'supplier',id:state.edit?.id,tier:state.edit?.tier??'wholesale',blacklisted:state.edit?.blacklisted??false,
              credit_limit:numeric(x.credit_limit,'حد الائتمان',{optional:true})});
            break;
          case 'settings': {
            const {invoice_prefix,default_fx,vat_rate,return_days,...profile}=x;
            await command('settings',{invoice_prefix,
              default_fx:numeric(default_fx,'سعر الصرف',{scale:6,min:0.000001}),vat_rate:numeric(vat_rate,'الضريبة',{scale:4,max:100}),
              return_days:numeric(return_days,'أيام الاسترجاع',{scale:0,max:365}),profile:{...state.info.settings.profile,...profile}});
            state.info=await rpc('status');
            break;
          }
          case 'warehouse':
          case 'account':
          case 'lookup':
            await command(op,x);
            break;
          case 'item':
          case 'purchaseCsv': {
            const convert=row=>({...item(row),unit_price:numeric(row.unit_price,'سعر الوحدة')});
            const added=op==='purchaseCsv'?parsed(x.csv,convert):x.imeis?
              x.imeis.split(/[\s,،]+/).filter(Boolean).map(imei=>convert({...x,imei,imei2:'',qty:1})):[convert(x)];
            state.items=batch([...state.items,...added]);
            if (op==='item') { target.elements.imei.value=''; target.elements.imei2.value=''; target.elements.imeis.value=''; }
            else target.reset();
            drawDraft();
            announce('اتضاف '+added.length+' بند للفاتورة.');
            return;
          }
          case 'payment': {
            const account=required(active('accounts').find(a=>a.id===x.account_id),'حساب الدفع');
            if (state.payments.length>=30) throw new Error('الحد الأقصى ٣٠ دفعة.');
            state.payments.push({account_id:account.id,method:account.kind==='bank'?'transfer':account.kind,
              amount:numeric(x.amount,'الدفعة',{min:0.01}),reference:x.reference});
            target.reset(); drawDraft(); announce('اتضافت الدفعة للفاتورة.'); return;
          }
          case 'purchase': {
            const supplier=required(active('suppliers').find(p=>p.id===x.party_id),'المورد');
            const payload={date:x.date,party_id:supplier.id,warehouse_id:required(x.warehouse_id,'المخزن'),
              reference:required(x.reference,'مرجع فاتورة المورد'),note:x.note,
              fx:supplier.currency==='USD'?numeric(x.fx,'سعر الصرف',{scale:6,min:0.000001}):1,
              fees:numeric(x.fees||0,'المصاريف'),discount:numeric(x.discount||0,'الخصم'),
              vat_rate:numeric(x.vat_rate||0,'الضريبة',{scale:4,max:100}),
              items:batch(state.items),payments:state.payments};
            if (!window.confirm('اعتماد فاتورة '+supplier.name+' بـ'+payload.items.length+' بند؟')) return;
            const saved=await command('purchase',payload);
            state.items=[]; state.payments=[];
            announce('اتسجلت فاتورة '+saved.number+' بإجمالي '+amount(saved.total)+' '+saved.currency+'.');
            await refreshTab('invoices');
            return;
          }
          case 'opening':
            return previewOpening(x.date,[openingRow(x)]);
          case 'openingCsv':
            return previewOpening(x.date,parsed(x.csv,row=>openingRow({...row,warehouse_id:row.warehouse_id||x.warehouse_id})));
          default: return;
        }
        state.edit=null;
        announce('تم الحفظ.');
        await loadSources();
        await refreshTab(state.tab);
      });
    }
    root.addEventListener('submit',submit);
    root.addEventListener('change',event=>{
      const file=event.target.matches('[data-mw-csv]')?event.target.files[0]:null;
      if (file) run(async()=>{
        if (file.size>2*1024*1024) throw new Error('الحد الأقصى للملف ٢ ميجابايت.');
        event.target.form.elements.csv.value=await file.text();
      });
    });
    root.addEventListener('click',event=>{
      const trigger=event.target.closest('button[data-mw-action]');
      if (!trigger) return;
      run(async()=>{
        const {mwAction:action,id}=trigger.dataset;
        if (action.startsWith('next:')) return list(action.slice(5),id);
        switch(action) {
          case 'tab': state.edit=null; return refreshTab(id);
          case 'retry': return start();
          case 'enable':
            if (!window.confirm('تفعيل جملة الموبايلات للمحل الحالي؟')) return;
            await rpc('enable',{p_enabled:true});
            await start(); announce('تم تفعيل النشاط.'); return;
          case 'editSku': state.edit=lookup('catalog',id); return catalog();
          case 'editSupplier': state.edit=lookup('suppliers',id); return suppliers();
          case 'cancelEdit': state.edit=null; return refreshTab(state.tab);
          case 'dropItem': state.items.splice(Number(id),1); return drawDraft();
          case 'dropPayment': state.payments.splice(Number(id),1); return drawDraft();
          case 'invoice': return invoice(id);
          case 'device': return device(id);
          case 'moreDevice': {const [deviceId,after]=id.split('/'); return device(deviceId,after);}
          case 'close': detail.hidden=true; detail.replaceChildren(); state.opening=null; return;
          case 'commitOpening': {
            if (!state.opening) return;
            const saved=await command('opening_batch',state.opening);
            state.opening=null; detail.hidden=true; detail.replaceChildren();
            announce('تم اعتماد '+saved.ids.length+' رصيد افتتاحي.'); return;
          }
        }
      });
    });
    section.innerHTML=panel('جملة الموبايلات','<p>جاري الاتصال بالمحل الحالي…</p>'+button('retry','إعادة المحاولة'));
    await run(start);
  }

  window.SNSWholesale={mount};
})();
