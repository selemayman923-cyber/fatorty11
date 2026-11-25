const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM, VirtualConsole}=require('jsdom');
(async()=>{
const errors=[],vc=new VirtualConsole();
vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8'),{
  url:'http://localhost:8787/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,
  beforeParse(w){w.localStorage.setItem('fat_mode','online');w.scrollTo=()=>{};}
});
const w=dom.window;
const ev=(fn,arg)=>w.eval('('+fn.toString()+')('+JSON.stringify(arg)+')');
const el=id=>w.document.getElementById(id);
const input=(id,v)=>{el(id).value=v;el(id).dispatchEvent(new w.Event('input',{bubbles:true}));};
const change=(id,v)=>{el(id).value=v;el(id).dispatchEvent(new w.Event('change',{bubbles:true}));};
const json=(fn,arg)=>JSON.parse(JSON.stringify(ev(fn,arg)));
try{
ev(()=>{
  fatSetMode('offline');
  db.settings.role='manager';
  db.settings.cashierMustShift=false;
  db.branches=[{id:'main',name:'الرئيسي'},{id:'east',name:'الشرق'}];
  db.settings.activeBranch='main';
  db.customers=[{id:'customer',name:'عميل تجريبي',balance:0}];
  maybeOnboard();
});
assert.match(el('snsIndustry').textContent,/اختيار مجال العمل/);
input('snsIndustrySearch','  اسفنج  ');
w.document.querySelector('[data-industry-field="upholstery"]').click();
input('wiz_name','محل القماش التجريبي');
w.document.querySelector('[data-industry-action="back"]').click();
w.document.querySelector('[data-industry-field="upholstery"]').click();
assert.equal(el('wiz_name').value,'محل القماش التجريبي');
w.document.querySelector('#snsIndustryForm button[type=submit]').click();
await new Promise(resolve=>setImmediate(resolve));
assert.equal(el('snsIndustry').hidden,true);
ev(()=>fatSetMode('online'));
assert.equal(ev(()=>db.settings.bizProfile.type),'upholstery');
assert.equal(el('brandName').textContent,'محل القماش التجريبي');
assert.equal(ev(()=>db.products.length),0);
assert.ok(el('snsFirstSaleTitle'));
const guideAction=handler=>w.document.querySelector('.sns-setup-guide button[onclick="'+handler+'"]');
assert.equal(guideAction("go('pos')"),null);
const create=async(kind,name,category,fields)=>{
 const guided=kind&&guideAction("snsStartUpholsteryItem('"+kind+"')");
 if(guided){
   guided.click();
   assert.equal(el('up_kind').value,kind);
   assert.equal(el('f_cat').value,category);
 }else{
   ev(()=>productForm());
   change('up_kind',kind);
 }
 input('f_name',name);
 change('f_cat',category);
 for(const [id,value] of Object.entries(fields)) input(id,value);
 await ev(()=>saveProduct());
 return ev(()=>db.products.at(-1).id);
};
const roll=await create('fabric','قطن بيج','أقمشة',{up_roll:'R-10',up_color:'بيج',f_price:100,f_wholesale:80,f_qty:12,f_cost:60});
const foam=await create('foam','إسفنج عالي الكثافة','إسفنج',{up_density:25,up_kgPrice:100,up_kgWholesale:80,f_price:2000,f_qty:3,f_cost:1250});
assert.equal(ev(roll=>fatBQOf(findProduct(roll),'main'),roll),12);
guideAction("go('pos')").click();
ev(roll=>posTap(roll),roll);
input('up_pick_amount','2.75');
assert.match(el('up_pick_info').textContent,/9\.25 متر/);
input('up_pick_amount','13');
assert.ok(el('up_pick_add').disabled);
ev(()=>{closeModal();go('products')});
const piece=await create('','لاصق','مستلزمات تنجيد',{f_price:50,f_qty:3,f_cost:20});
ev(()=>go('pos'));
ev(()=>scanBarcode({value:'R-10'}));
change('up_pick_mode','yd');
input('up_pick_amount','2.5');
el('up_pick_add').click();
assert.equal(ev(()=>cart[0].qty),2.286);
ev(foam=>posTap(foam),foam);
input('up_pick_width','115');
input('up_pick_length','2.35');
input('up_pick_height','7.5');
el('up_pick_add').click();
assert.equal(ev(()=>cart[1].qty),0.202688);
ev(foam=>posTap(foam),foam);
change('up_pick_mode','kg');
input('up_pick_amount','1.5');
el('up_pick_add').click();
ev(piece=>posTap(piece),piece);
assert.equal(ev(()=>posCalc().total),833.98);
ev(()=>holdSale());
await ev(()=>resumeHeld(db.heldSales[0].id));
assert.deepEqual(json(()=>cart.map(c=>c.measure?.mode||null)),['yd','size','kg',null]);
ev(()=>{db.settings.activeBranch='east';posCheckout()});
assert.equal(ev(()=>db.sales.length),0);
await ev(()=>{db.settings.activeBranch='main';return posCheckout()});
const sold=json(({roll,foam,piece})=>({
  id:db.sales[0]?.id,sales:db.sales.length,qty:[roll,foam,piece].map(id=>findProduct(id).qty),
  branch:[roll,foam,piece].map(id=>fatBQOf(findProduct(id),'main')),
  total:db.sales[0]?.total,cash:db.cash[0]?.amount
}),{roll,foam,piece});
assert.equal(sold.sales,1);
assert.deepEqual(sold.qty,[9.714,2.737312,2]);
assert.deepEqual(sold.qty,sold.branch);
assert.equal(sold.total,833.98);
assert.equal(sold.cash,833.98);
ev(()=>go('dashboard'));
assert.equal(el('snsFirstSaleTitle'),null);
ev(id=>returnForm('sale',id),sold.id);
const ret=w.document.querySelectorAll('#modal input[type=number]')[1];
ret.value='0.202688';
ret.dispatchEvent(new w.Event('input',{bubbles:true}));
w.document.querySelector('#modal button[onclick="saveReturn()"]').click();
assert.equal(ev(foam=>findProduct(foam).qty,foam),2.94);
ev(id=>returnForm('sale',id),sold.id);
assert.equal(w.document.querySelectorAll('#modal input[type=number]').length,3);
await ev(id=>{closeModal();return delSale(id)},sold.id);
assert.equal(ev(()=>db.sales.length),1);
ev(()=>{go('pos');window._posCheckingOut=false});
ev(roll=>posTap(roll),roll);
input('up_pick_amount','1.25');
el('up_pick_add').click();
change('posCustomer','customer');
change('posPay','credit');
await ev(()=>posCheckout());
const credit=json(()=>({id:db.sales.at(-1).id,due:db.sales.at(-1).dueAmount,balance:db.customers[0].balance}));
assert.equal(credit.due,125);
assert.equal(credit.balance,125);
const creditPosting=json(id=>db.sales.find(s=>s.id===id).posting,credit.id);
assert.ok(creditPosting.lines.some(line=>line.code==='1300'&&line.debit===125));
await ev(id=>{confirmBox=async()=>true;return delSale(id)},credit.id);
assert.equal(ev(()=>db.customers[0].balance),0);
assert.ok(ev(id=>db.sales.find(s=>s.id===id).voided,credit.id));
const creditEntries=json(id=>fatBuildJournal('','').filter(e=>e.sourceId===id),credit.id);
assert.equal(creditEntries.length,2);
assert.equal(creditEntries[1].lines.find(line=>line.code==='1300').credit,125);
assert.equal(ev(roll=>findProduct(roll).qty,roll),9.714);
ev(()=>{go('pos');window._posCheckingOut=false});
ev(piece=>{findProduct(piece).packSize=2;posTap(piece)},piece);
input('pickCartons','1');
ev(()=>pickerConfirm());
assert.equal(ev(()=>cart[0].qty),2);
ev(()=>{cart=[];sessionStorage.removeItem('fat_pos_draft');renderCart();closeModal();go('products')});
const otherRoll=await create('fabric','قطن بيج','أقمشة',{up_roll:'R-11',up_color:'أبيض',f_price:100,f_qty:2,up_remnantAt:2,up_remnantPrice:45});
ev(()=>go('pos'));
ev(otherRoll=>posTap(otherRoll),otherRoll);
input('up_pick_amount','1');
el('up_pick_add').click();
assert.equal(ev(()=>posCalc().total),45);
ev(()=>{printThermal=()=>{};posSaveAsQuote();cart=[];renderCart();});
ev(()=>convertQuote(db.quotes.at(-1).id));
assert.equal(ev(()=>cart[0].measure.mode),'m');
await ev(()=>posCheckout());
assert.equal(ev(()=>db.quotes.at(-1).status),'converted');
assert.equal(ev(otherRoll=>findProduct(otherRoll).qty,otherRoll),1);
// A closed period must block voiding before any stock, cash, or records change.
ev(()=>{db.settings.lockBefore=today();confirmBox=async()=>true;});
const beforeBlockedVoid=json(()=>({sales:db.sales,stockMoves:db.stockMoves,cash:db.cash}));
await ev(id=>delSale(id),sold.id);
assert.deepEqual(json(()=>({sales:db.sales,stockMoves:db.stockMoves,cash:db.cash})),beforeBlockedVoid);
ev(()=>{db.settings.lockBefore='';});

// Opening or cancelling the purchase form does not count as receiving stock.
ev(roll=>{
  db.suppliers=[{id:'supplier',name:'مورد تجريبي',balance:0}];
  db.purchaseOrders=[{id:'order',no:1,date:today(),supplierId:'supplier',supplierName:'مورد تجريبي',
    status:'pending',items:[{pid:roll,name:'قطن بيج',qty:5,estCost:60}]}];
},roll);
await ev(()=>receivePO('order'));
assert.equal(ev(()=>db.purchaseOrders[0].status),'pending');
assert.equal(ev(()=>db.purchases.length),0);
ev(()=>closeModal());
await ev(()=>receivePO('order'));
ev(()=>{invLines[0].qty=6;saveInvoice();});
assert.equal(ev(()=>db.purchases.length),0);
ev(()=>{invLines[0].qty=2;saveInvoice();});
assert.equal(ev(()=>db.purchaseOrders[0].status),'partial');
assert.equal(ev(()=>db.purchases[0].purchaseOrderId),'order');
assert.equal(ev(()=>purchaseOrderRemaining(db.purchaseOrders[0])[0].qty),3);
await ev(()=>receivePO('order'));
assert.equal(ev(()=>invLines[0].qty),3);
ev(()=>saveInvoice());
assert.equal(ev(()=>db.purchaseOrders[0].status),'received');
assert.equal(ev(()=>purchaseOrderRemaining(db.purchaseOrders[0]).length),0);
assert.equal(ev(()=>db.purchases.length),2);
assert.equal(ev(()=>fatTrialBalance('','').balanced),true);
assert.ok(ev(()=>db.returns[0].posting.lines.length>0));
assert.ok(ev(()=>fatBuildJournal('','').some(e=>e.sourceKind==='purchase'&&e.sourceId===db.purchases[0].id)));
// Use a fresh credit invoice with its original journal in a previous period.
ev(piece=>{go('pos');window._posCheckingOut=false;findProduct(piece).packSize=0;posTap(piece)},piece);
change('posCustomer','customer');
change('posPay','credit');
await ev(()=>posCheckout());
const historical=ev(()=>{
  const sale=db.sales.at(-1);
  sale.date=addDays(today(),-1);sale.posting.date=sale.date;
  db.settings.lockBefore=sale.date;
  promptBox=async()=>20;
  return sale.id;
});
const closedEntries=json(()=>fatBuildJournal('',db.settings.lockBefore));
const origPosting=json(id=>db.sales.find(s=>s.id===id).posting,historical);
const beforeSettlement=json(id=>({cash:db.cash.length,returnCount:db.returns.length,customer:db.customers[0].balance,
  due:db.sales.find(s=>s.id===id).dueAmount}),historical);
await ev(id=>collectInvoice('sale',id),historical);
assert.equal(ev(id=>db.sales.find(s=>s.id===id).dueAmount,historical),beforeSettlement.due-20);
assert.equal(ev(()=>db.cash.at(-1).invoiceSettlement.amount),20);
assert.equal(ev(()=>db.cash.at(-1).date),ev(()=>today()));
ev(id=>{returnForm('sale',id);retLines[0].ret=1;saveReturn()},historical);
assert.equal(ev(()=>db.returns.length),beforeSettlement.returnCount+1);
assert.equal(ev(()=>db.returns.at(-1).invoiceSettlement.amount),beforeSettlement.due-20);
assert.equal(ev(id=>db.sales.find(s=>s.id===id).dueAmount,historical),0);
assert.equal(ev(()=>db.customers[0].balance),beforeSettlement.customer-beforeSettlement.due);
assert.deepEqual(json(id=>db.sales.find(s=>s.id===id).posting,historical),origPosting);
assert.deepEqual(json(()=>fatBuildJournal('',db.settings.lockBefore)),closedEntries);
assert.equal(ev(id=>db.sales.find(s=>s.id===id).settlementRefs.length,historical),2);
assert.equal(ev(()=>fatTrialBalance('','').balanced),true);
ev(()=>{db.settings.lockBefore=today();promptBox=async()=>{throw new Error('closed');};});
await ev(id=>collectInvoice('sale',id),historical);
ev(()=>{db.settings.lockBefore='';});

// A supplier payment in an open period reduces payables without changing the invoice posting.
ev(roll=>{
  invoiceForm('purchase',null,'supplier');
  invLines=[{pid:roll,qty:2,price:60}];
  document.getElementById('inv_date').value=addDays(today(),-1);
  document.getElementById('inv_pm').value='credit';
  saveInvoice();
},roll);
const historicalPurchase=ev(()=>db.purchases.at(-1).id);
const openingPayable=ev(()=>db.suppliers[0].balance);
ev(()=>{db.settings.lockBefore=addDays(today(),-1);promptBox=async()=>30;});
const lockedPurchaseEntries=json(()=>fatBuildJournal('',db.settings.lockBefore));
await ev(id=>collectInvoice('purchase',id),historicalPurchase);
assert.equal(ev(()=>db.suppliers[0].balance),openingPayable-30);
assert.equal(ev(id=>db.purchases.find(p=>p.id===id).dueAmount,historicalPurchase),90);
assert.equal(ev(()=>db.cash.at(-1).invoicePayment.kind),'purchase');
assert.deepEqual(json(()=>fatBuildJournal('',db.settings.lockBefore)),lockedPurchaseEntries);
ev(()=>{db.settings.lockBefore='';});
const monthEntries=json(()=>fatBuildJournal('','').filter(e=>e.sourceId));
for(const entry of monthEntries){
  const sum=entry.lines.reduce((total,line)=>total+Math.round(line.debit*100)-Math.round(line.credit*100),0);
  assert.equal(sum,0,entry.desc);
}
// A manager's saved default is applied after the foam line discount.
ev(()=>{
  partyForm('customer','customer');
  db.settings.vat=0;
});
input('p_invoiceDiscount','5');
ev(()=>saveParty('customer','customer'));
assert.equal(ev(()=>findCustomer('customer').invoiceDiscountPct),5);
ev(foam=>{go('pos');findProduct(foam).price=6000;posTap(foam);},foam);
change('up_pick_length_unit','cm');
input('up_pick_width','120');
input('up_pick_length','200');
input('up_pick_height','18');
input('up_pick_discount','10');
assert.match(el('up_pick_info').textContent,/2,332\.80/);
el('up_pick_add').click();
assert.equal(ev(()=>cart[0].qty),0.432);
assert.equal(ev(()=>posCalc().total),2332.8);
ev(foam=>upholsteryPicker(findProduct(foam),cart[0].lid),foam);
assert.equal(el('up_pick_length').value,'200');
assert.equal(el('up_pick_discount').value,'10');
el('up_pick_add').click();
change('posCustomer','customer');
assert.equal(ev(()=>posCalc().total),2216.16);
input('posDisc','0');
assert.equal(ev(()=>posCalc().total),2332.8);
input('posDisc','');
assert.equal(ev(()=>posCalc().total),2216.16);
await ev(()=>posCheckout());
assert.equal(ev(()=>db.sales.at(-1).total),2216.16);
assert.equal(ev(()=>db.sales.at(-1).items[0].lineDiscPct),10);
assert.equal(ev(()=>db.sales.at(-1).items[0].grossUnit),6000);
const foamPosting=json(()=>db.sales.at(-1).posting.lines);
assert.equal(foamPosting.reduce((sum,line)=>sum+Math.round(line.debit*100)-Math.round(line.credit*100),0),0);
assert.ok(foamPosting.some(line=>line.code==='1100'&&line.debit===2216.16));

// The same foam SKU supports whole pieces and calculated weight against one volume balance.
ev(foam=>{
  const product=findProduct(foam);
  product.qty=2;
  product.bq={main:1,east:1};
  go('pos');
  posTap(foam);
},foam);
change('up_pick_mode','piece');
change('up_pick_length_unit','cm');
input('up_pick_width','120');
input('up_pick_length','200');
input('up_pick_height','18');
input('up_pick_discount','10');
input('up_pick_count','3');
assert.equal(el('up_pick_add').disabled,true);
assert.match(el('up_pick_info').textContent,/الرئيسي/);
assert.match(el('up_pick_info').textContent,/الناقص 0.296 م³/);
assert.match(el('up_pick_info').textContent,/الشرق 1 م³/);
ev(()=>{window._fatMyBranch='main';upholsteryPreview();});
assert.doesNotMatch(el('up_pick_info').textContent,/الشرق/);
ev(()=>{window._fatMyBranch=null;});
input('up_pick_count','1.5');
assert.equal(el('up_pick_add').disabled,true);
input('up_pick_count','2');
assert.match(el('up_pick_info').textContent,/4,665\.60/);
el('up_pick_add').click();
assert.equal(ev(()=>cart[0].qty),0.864);
await ev(()=>posCheckout());
const pieceSale=json(()=>db.sales.at(-1));
assert.equal(pieceSale.total,4665.6);
assert.equal(pieceSale.items[0].measure.count,2);
assert.deepEqual(json(()=>snsInvoiceSaleUnit(db.sales.at(-1).items[0])),{amount:2,label:'قطعة'});
assert.equal(ev(foam=>fatBQOf(findProduct(foam),'main'),foam),0.136);
assert.equal(ev(foam=>fatBQOf(findProduct(foam),'east'),foam),1);

ev(foam=>{
 const p=findProduct(foam);
 p.qty=2;
 p.bq={main:1,east:1};
 go('pos');
 posTap(foam);
},foam);
change('up_pick_mode','kg_size');
change('up_pick_length_unit','cm');
input('up_pick_width','120');
input('up_pick_length','200');
input('up_pick_height','18');
input('up_pick_count','2');
input('up_pick_discount','10');
assert.match(el('up_pick_info').textContent,/21.6 كجم/);
assert.match(el('up_pick_info').textContent,/1,944\.00/);
el('up_pick_add').click();
assert.equal(ev(()=>cart[0].measure.amount),21.6);
assert.equal(ev(()=>cart[0].qty),0.864);
await ev(()=>posCheckout());
assert.equal(ev(()=>db.sales.at(-1).total),1944);
assert.equal(ev(foam=>fatBQOf(findProduct(foam),'main'),foam),0.136);

// Manual invoices aggregate repeated lines. POS also reports the available warehouses.
ev(piece=>{
  const p=findProduct(piece);
  p.qty=10;
  p.bq={main:3,east:7};
  invoiceForm('sale');
  invLines=[{pid:piece,qty:2,price:50},{pid:piece,qty:3,price:50}];
  renderInvLines();
  calcInv();
},piece);
assert.equal(el('snsInvoiceStock').hidden,false);
assert.match(el('snsInvoiceStock').textContent,/المطلوب 5/);
assert.match(el('snsInvoiceStock').textContent,/المتاح 3/);
assert.match(el('snsInvoiceStock').textContent,/الناقص 2/);
assert.match(el('snsInvoiceStock').textContent,/الشرق 7/);
const saleCount=ev(()=>db.sales.length);
ev(()=>saveInvoice());
assert.equal(ev(()=>db.sales.length),saleCount);
ev(()=>{invLines[1].qty=1;calcInv();});
assert.equal(el('snsInvoiceStock').hidden,true);
ev(piece=>{
  closeModal();
  go('pos');
  cart=[{lid:'shortage',pid:piece,qty:5}];
  renderCart();
},piece);
assert.match(el('snsPosStock').textContent,/الشرق 7/);
await ev(()=>posCheckout());
assert.equal(ev(()=>db.sales.length),saleCount);
ev(()=>{cart=[];renderCart();});

// One stock unit per SKU: fixed net-weight cartons and loose weight share kilograms.
ev(()=>{go('products');productForm();});
input('f_name','فيبر رولات تجريبي');
change('f_cat','فيبر');
ev(()=>{document.getElementById('f_byweight').checked=true;toggleWeightUI();});
input('f_cartonKg','4.5');
input('f_price','25');
input('f_qty','20');
await ev(()=>saveProduct());
const fibre=ev(()=>db.products.at(-1).id);
ev(fibre=>{go('pos');posTap(fibre);},fibre);
input('pickCartons','2');
input('pickGrams','500');
ev(()=>pickerConfirm());
assert.equal(ev(()=>cart[0].qty),9.5);
assert.equal(ev(()=>posCalc().total),237.5);
ev(fibre=>openItemPicker(fibre,cart[0].lid),fibre);
assert.equal(el('pickCartons').value,'2');
assert.equal(el('pickGrams').value,'500');
ev(()=>pickerConfirm());
await ev(()=>posCheckout());
assert.equal(ev(fibre=>fatBQOf(findProduct(fibre),'main'),fibre),10.5);
assert.equal(ev(()=>db.sales.at(-1).items[0].cartons),2);

// A roll split between warehouses is counted once in the total, with separate metre balances.
ev(({roll,otherRoll})=>{
 const a=findProduct(roll), b=findProduct(otherRoll);
 a.upholstery.family='قطن المجموعة';
 b.upholstery.family='قطن المجموعة';
 a.bq={main:4,east:2};
 a.qty=6;
 b.bq={main:0,east:1};
 b.qty=1;
 go('branchStock');
},{roll,otherRoll});
const rollRows=[...w.document.querySelectorAll('tr[data-sns-roll-stock]')];
assert.equal(rollRows.length,2);
const beige=rollRows.find(row=>row.cells[0].textContent.includes('بيج'));
assert.match(beige.cells[1].textContent,/1 \/ 4/);
assert.match(beige.cells[2].textContent,/1 \/ 2/);
assert.match(beige.cells[3].textContent,/1 \/ 6/);
// Reserve each source warehouse's minimum and allocate its surplus only once.
ev(piece=>{
 const p=findProduct(piece);
 p.qty=14;
 p.bq={main:2,east:11,store:1};
 db.branches.push({id:'store',name:'مخزن ثالث'});
 go('products');
 productForm(piece);
 const minimums={main:7,east:6,store:5};
 for(const input of document.querySelectorAll('[data-sns-warehouse-min]'))input.value=minimums[input.dataset.snsWarehouseMin];
 saveProduct(piece);
 go('branchStock');
},piece);
assert.deepEqual(json(piece=>snsWarehouseReorder(fatBranchList()).filter(row=>row.p.id===piece).map(row=>({
 warehouse:row.warehouse,transfers:row.transfers,buy:row.buy,
})),piece),[
 {warehouse:'الرئيسي',transfers:[{warehouse:'الشرق',quantity:5}],buy:0},
 {warehouse:'مخزن ثالث',transfers:[],buy:4},
]);
assert.match(el('snsWarehouseReorder').textContent,/الشرق 5/);
assert.equal(ev(piece=>findProduct(piece).qty,piece),14);
// Finished bedding can use different pricing units while stock and returns count whole pieces.
goNewItem();
const pillow=await create('pillow','مخدة مقاس تجريبي','مخدات',{f_price:150,f_cost:70,f_qty:3});
const mattress=await create('mattress','مرتبة مقاس تجريبي','مراتب',{f_price:7000,f_cost:4500,f_qty:3});
function goNewItem(){ev(()=>{db.settings.activeBranch='main';go('products');});}
assert.deepEqual(json(({pillow,mattress})=>[pillow,mattress].map(id=>findProduct(id).upholstery.priceBasis),{pillow,mattress}),['linear','area']);

ev(pillow=>{go('pos');db.settings.vat=0;posTap(pillow);},pillow);
assert.equal(el('up_pick_length_unit').value,'cm');
assert.equal(el('up_pick_width').closest('label').hidden,true);
input('up_pick_length','120');
input('up_pick_discount','10');
assert.match(el('up_pick_info').textContent,/162\.00/);
input('up_pick_length','60');
assert.match(el('up_pick_info').textContent,/81\.00/);
input('up_pick_length','120');
input('up_pick_count','4');
assert.equal(el('up_pick_add').disabled,true);
assert.match(el('up_pick_info').textContent,/الناقص 1 قطعة/);
input('up_pick_count','2');
el('up_pick_add').click();
assert.equal(ev(()=>cart[0].qty),2);
assert.equal(ev(()=>posCalc().total),324);
await ev(()=>posCheckout());
assert.equal(ev(pillow=>fatBQOf(findProduct(pillow),'main'),pillow),1);
assert.equal(ev(()=>db.sales.at(-1).cost),140);
assert.equal(ev(()=>db.sales.at(-1).items[0].measure.rate),150);
ev(()=>returnForm('sale',db.sales.at(-1).id));
ev(()=>{retLines[0].ret=.5;saveReturn();});
assert.match(el('toast').textContent,/بعدد قطع صحيح/);
ev(()=>{retLines[0].ret=1;saveReturn();});
assert.equal(ev(pillow=>fatBQOf(findProduct(pillow),'main'),pillow),2);
assert.equal(ev(()=>db.returns.at(-1).total),162);

ev(mattress=>{closeModal();go('pos');posTap(mattress);},mattress);
input('up_pick_width','120');
input('up_pick_length','195');
input('up_pick_discount','10');
assert.equal(el('up_pick_height').closest('label').hidden,true);
assert.match(el('up_pick_info').textContent,/14,742\.00/);
change('up_pick_length_unit','m');
input('up_pick_length','2');
assert.match(el('up_pick_info').textContent,/15,120\.00/);
el('up_pick_add').click();
assert.equal(ev(()=>cart[0].qty),1);
assert.equal(ev(()=>posCalc().total),15120);
await ev(()=>posCheckout());
assert.equal(ev(mattress=>fatBQOf(findProduct(mattress),'main'),mattress),2);
assert.equal(ev(()=>db.sales.at(-1).items[0].measure.basis),'area');

ev(mattress=>{go('products');productForm(mattress);},mattress);
change('up_bedding_basis','volume');
input('f_price','8000');
await ev(mattress=>saveProduct(mattress),mattress);
ev(mattress=>{go('pos');posTap(mattress);},mattress);
input('up_pick_width','120');
input('up_pick_length','200');
input('up_pick_discount','10');
assert.equal(el('up_pick_add').disabled,true);
input('up_pick_height','20');
assert.match(el('up_pick_info').textContent,/3,456\.00/);
el('up_pick_add').click();
assert.equal(ev(()=>cart[0].qty),1);
assert.equal(ev(()=>posCalc().total),3456);
assert.equal(ev(()=>db.sales.at(-1).total),15120);
// Historical categories are unified without changing stock or IDs.
ev(()=>{
 db.products.push(
  {id:'old-roll',name:'رول فيبر تجريبي',cat:'فيبر رول',qty:10,unit:'رول'},
  {id:'old-loose',name:'فيبر سايب تجريبي',cat:'فيبر سايب',qty:7,unit:'كجم'},
  {id:'old-boxes',name:'علب مسامير',cat:'الاكسسوارات',qty:60,bq:{main:60},unit:'قطعة',cost:5,price:10,min:0},
  {id:'old-sheet',name:'لوح إسفنج قديم',cat:'الاسفنج',qty:3,bq:{main:3},unit:'لوح',cost:100,price:200,min:0}
 );
 db.categories.push({id:'duplicate-foam',name:'الأسفنج'},{id:'old-fabric-cat',name:'الأتواب'});
 _rebuildProdIdx();
 go('products');
 window.confirmBox=async()=>true;
});
assert.equal(ev(()=>getAllCats().filter(c=>c==='إسفنج').length),1);
assert.equal(ev(()=>getAllCats().filter(c=>c.includes('فيبر')).length),1);
await ev(()=>snsUpholsteryCategoryCleanup());
assert.deepEqual(json(()=>['old-roll','old-loose','old-boxes','old-sheet'].map(id=>[findProduct(id).cat,findProduct(id).qty])),
 [['فيبر',10],['فيبر',7],['مستلزمات تنجيد',60],['إسفنج',3]]);
assert.equal(ev(()=>db.products.some(p=>p.cat==='إكسسوارات')),false);
assert.ok(ev(()=>getAllCats().includes('إكسسوارات')));
assert.equal(ev(()=>snsUpholsteryCategoryCleanupCount()),0);

// Five cartons of twelve: sell four boxes, buy two cartons, then return two boxes.
ev(()=>productForm('old-boxes'));
input('f_boxesPerCarton','12');
await ev(()=>saveProduct('old-boxes'));
assert.equal(ev(()=>findProduct('old-boxes').qty),60);
ev(()=>{go('pos');cart=[];renderCart();posTap('old-boxes');});
input('pickQty','4');
assert.match(el('pickInfo').textContent,/4 كرتونة \+ 8 علبة/);
ev(()=>pickerConfirm());
assert.equal(ev(()=>cart[0].qty),4);
await ev(()=>posCheckout());
const boxInvoice=ev(()=>db.sales.at(-1).id);
assert.equal(ev(()=>findProduct('old-boxes').qty),56);
assert.equal(ev(()=>db.sales.at(-1).items[0].boxStock),true);
ev(id=>{returnForm('sale',id);retLines[0].ret=2;saveReturn();},boxInvoice);
assert.equal(ev(()=>findProduct('old-boxes').qty),58);
ev(()=>{
 invoiceForm('purchase',null,'supplier');
 setLineProduct(0,'old-boxes');
 window.__cartonAnswers=['2','125'];
 window.promptBox=async()=>window.__cartonAnswers.shift();
});
assert.match(el('invBody').textContent,/إدخال بالكراتين/);
await ev(()=>snsBoxesPurchase(0));
assert.equal(ev(()=>invLines[0].qty),24);
assert.equal(ev(()=>r2(invLines[0].qty*invLines[0].price)),250);
await ev(()=>saveInvoice());
assert.equal(ev(()=>findProduct('old-boxes').qty),82);

// An imported foam sheet opts into a dedicated cubic-metre tariff; quantity and cost remain per sheet.
ev(()=>{closeModal();go('products');productForm('old-sheet');});
assert.equal(el('up_foamPiece').hidden,false);
input('up_pieceVolumeRate','6000');
await ev(()=>saveProduct('old-sheet'));
assert.deepEqual(json(()=>[findProduct('old-sheet').qty,findProduct('old-sheet').price,
 findProduct('old-sheet').upholstery.kind]),[3,200,'foamPiece']);
ev(()=>{go('pos');cart=[];renderCart();posTap('old-sheet');});
input('up_pick_width','120');
input('up_pick_length','200');
input('up_pick_height','18');
input('up_pick_discount','10');
assert.match(el('up_pick_info').textContent,/2,332\.80/);
el('up_pick_add').click();
await ev(()=>posCheckout());
assert.equal(ev(()=>db.sales.at(-1).total),2332.8);
assert.equal(ev(()=>fatBQOf(findProduct('old-sheet'),'main')),2);
assert.deepEqual(errors,[]);
console.log('PASS guided setup, first invoice, stock preview, product forms, barcode, yards, foam dimensions and weight, held sales, branch stock, POS cash and credit, returns, closed periods, open-period settlements and partial purchase receipts');
}finally{dom.window.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
