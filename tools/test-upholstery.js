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
assert.deepEqual(errors,[]);
console.log('PASS guided setup, first invoice, stock preview, product forms, barcode, yards, foam dimensions and weight, held sales, branch stock, POS cash and credit, returns, closed periods, open-period settlements and partial purchase receipts');
}finally{dom.window.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
